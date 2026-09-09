import { runSource } from '../adapters/run.js';
import type { Correction, Edition, SourceRef, Story } from '../core/edition.js';
import type { Signal } from '../core/signal.js';
import { writeStoryFile } from '../store/edition-store.js';
import { paths } from '../store/paths.js';
import { appendToWire } from '../store/wire.js';
import {
  resolveCopyDesk,
  resolveEditor,
  resolveReporter,
  resolveWriter,
  runJob,
} from './agents.js';
import type { PipelineContext } from './context.js';
import { mapLimit } from './context.js';
import type { CopyCheck, EditorCall, FiledReport } from './contracts.js';
import {
  type EditionDraft,
  type StoryDraft,
  formatSignals,
  recordUsage,
  slugify,
} from './draft.js';
import { loadPrompt, renderTemplate } from './prompts.js';

function personaBlock(ctx: PipelineContext, reporterName: string): string {
  const persona =
    ctx.newsroom.personas.get(reporterName) ?? ctx.newsroom.personas.get(slugify(reporterName));
  return persona ? `Your bio:\n${persona}` : '';
}

/** WIRE — run every source, archive new signals, form one provisional story per beat. */
export async function stageWire(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  const p = paths(ctx.root);
  ctx.log.emit('WIRE', 'stage_start');
  const allSignals: Signal[] = [];
  const stories: StoryDraft[] = [];

  for (const beat of ctx.newsroom.beats) {
    const beatSignals: Signal[] = [];
    for (const source of beat.sources) {
      const result = await runSource(source, p.stateDir, ctx.now);
      if (result.error) {
        draft.warnings.push(`Source "${source.id}" (${source.type}): ${result.error}`);
        ctx.log.emit('WIRE', 'source_error', { source: source.id, error: result.error });
        continue;
      }
      ctx.log.emit('WIRE', 'source_done', { source: source.id, count: result.signals.length });
      beatSignals.push(...result.signals);
    }
    allSignals.push(...beatSignals);
    if (beatSignals.length > 0) {
      stories.push({
        slug: slugify(beat.id),
        beatId: beat.id,
        beatName: beat.name,
        signals: beatSignals,
        reporterName: beat.reporter ?? `The ${beat.name} Desk`,
        reporterProviderId: '',
        reports: [],
      });
    }
  }

  appendToWire(ctx.root, allSignals);
  draft.stories = stories;
  ctx.log.emit('WIRE', 'stage_done', { signals: allSignals.length, stories: stories.length });
}

/** ASSIGN — resolve which desk (provider) each story's reporter and writer belong to. */
export async function stageAssign(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('ASSIGN', 'stage_start');
  for (const story of draft.stories) {
    const reporter = resolveReporter(ctx.newsroom, story.beatId, ctx.forceProvider);
    const writer = resolveWriter(ctx.newsroom, story.beatId, ctx.forceProvider);
    story.reporterProviderId = reporter.providerId;
    story.writerProviderId = writer.providerId;
    writeStoryFile(
      ctx.root,
      draft.id,
      story.slug,
      'assignment.json',
      JSON.stringify(
        {
          beat: story.beatId,
          reporter: reporter.providerId,
          writer: writer.providerId,
          signals: story.signals.length,
        },
        null,
        2,
      ),
    );
    ctx.log.emit('ASSIGN', 'assigned', { story: story.slug, reporter: reporter.providerId });
  }
  ctx.log.emit('ASSIGN', 'stage_done', { stories: draft.stories.length });
}

/** REPORT — each reporter investigates their story and files a report (JSON). */
export async function stageReport(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('REPORT', 'stage_start');
  const template = await loadPrompt(ctx.root, 'reporter');
  await mapLimit(draft.stories, ctx.concurrency, async (story) => {
    ctx.log.emit('reporter', 'leave_desk', { story: story.slug, reporter: story.reporterName });
    const resolved = resolveReporter(ctx.newsroom, story.beatId, ctx.forceProvider);
    const systemPrompt = renderTemplate(template, {
      reporterName: story.reporterName,
      paperName: draft.paperName,
      beatName: story.beatName,
      style: ctx.newsroom.style,
      persona: personaBlock(ctx, story.reporterName),
    });
    try {
      const outcome = await runJob<FiledReport>({
        role: 'reporter',
        resolved,
        systemPrompt,
        userPrompt: formatSignals(story.signals),
        signals: story.signals,
        timeoutMs: ctx.reporterTimeoutMs,
        wantJson: true,
      });
      recordUsage(draft, outcome.providerId, 'reporter', outcome.usage);
      const report = normalizeReport(outcome.data, story);
      story.reports.push(report);
      writeStoryFile(
        ctx.root,
        draft.id,
        story.slug,
        `reports/${slugify(story.reporterName)}.md`,
        reportToMarkdown(report),
      );
      ctx.log.emit('reporter', 'filed', { story: story.slug, confidence: report.confidence });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(`Reporter failed on "${story.slug}": ${msg}`);
      ctx.log.emit('reporter', 'error', { story: story.slug, error: msg });
    }
  });
  // Drop stories that produced no report at all.
  draft.stories = draft.stories.filter((s) => s.reports.length > 0);
  ctx.log.emit('REPORT', 'stage_done', { stories: draft.stories.length });
}

/** ANGLES — M1 runs a single angle per story, so this stage just records that. */
export async function stageAngles(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('ANGLES', 'stage_done', {
    note: 'single-angle mode (M1)',
    stories: draft.stories.length,
  });
}

/** CALL — the managing editor sets headline, angle and placement, then the front page. */
export async function stageCall(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('CALL', 'stage_start');
  const template = await loadPrompt(ctx.root, 'editor');
  const editor = resolveEditor(ctx.newsroom, ctx.forceProvider);

  for (const story of draft.stories) {
    const systemPrompt = renderTemplate(template, {
      paperName: draft.paperName,
      beatName: story.beatName,
      style: ctx.newsroom.style,
    });
    try {
      const outcome = await runJob<EditorCall>({
        role: 'editor',
        resolved: editor,
        systemPrompt,
        userPrompt: reportsForEditor(story),
        signals: story.signals,
        timeoutMs: ctx.editorTimeoutMs,
        wantJson: true,
      });
      recordUsage(draft, outcome.providerId, 'editor', outcome.usage);
      story.call = normalizeCall(outcome.data, story);
      writeStoryFile(ctx.root, draft.id, story.slug, 'call.md', callToMarkdown(story.call));
      ctx.log.emit('editor', 'call', { story: story.slug, placement: story.call.placement });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(`Editor failed on "${story.slug}": ${msg}`);
      story.call = fallbackCall(story);
    }
  }

  // Spiked stories leave the run; brief-placement ones become briefs at PRESS.
  const spiked = draft.stories.filter((s) => s.call?.placement === 'spike');
  for (const s of spiked) draft.warnings.push(`Spiked "${s.slug}": ${s.call?.rationale ?? ''}`);
  draft.stories = draft.stories.filter((s) => s.call?.placement !== 'spike');

  await frontPage(draft, ctx);
  ctx.log.emit('CALL', 'stage_done', { stories: draft.stories.length });
}

async function frontPage(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  const headlines = draft.stories.map((s) => s.call?.headline ?? s.beatName);
  if (headlines.length === 0) {
    draft.weatherLine = 'A quiet day on the wire. The presses idle.';
    return;
  }
  const template = await loadPrompt(ctx.root, 'frontpage');
  const editor = resolveEditor(ctx.newsroom, ctx.forceProvider);
  try {
    const outcome = await runJob<{ weatherLine?: string; editorsLog?: string[] }>({
      role: 'editor',
      resolved: editor,
      systemPrompt: renderTemplate(template, {
        paperName: draft.paperName,
        style: ctx.newsroom.style,
      }),
      userPrompt: headlines.map((h, i) => `${i + 1}. ${h}`).join('\n'),
      signals: [],
      timeoutMs: ctx.editorTimeoutMs,
      wantJson: true,
    });
    recordUsage(draft, outcome.providerId, 'editor', outcome.usage);
    if (outcome.data?.weatherLine) draft.weatherLine = outcome.data.weatherLine;
    if (Array.isArray(outcome.data?.editorsLog)) draft.editorsLog.push(...outcome.data.editorsLog);
  } catch {
    draft.weatherLine = draft.weatherLine ?? 'The city stirs. Ink is cheap; the truth less so.';
  }
}

/** WRITE — the rewrite desk turns each non-brief story into finished copy. */
export async function stageWrite(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('WRITE', 'stage_start');
  const template = await loadPrompt(ctx.root, 'writer');
  const toWrite = draft.stories.filter((s) => s.call?.placement !== 'brief');
  await mapLimit(toWrite, ctx.concurrency, async (story) => {
    const resolved = resolveWriter(ctx.newsroom, story.beatId, ctx.forceProvider);
    const systemPrompt = renderTemplate(template, {
      paperName: draft.paperName,
      beatName: story.beatName,
      style: ctx.newsroom.style,
      chosenAngle: story.call?.chosenAngle ?? story.reports[0]?.proposedAngle ?? '',
    });
    try {
      const outcome = await runJob<string>({
        role: 'writer',
        resolved,
        systemPrompt,
        userPrompt: writerMaterials(story),
        signals: story.signals,
        timeoutMs: ctx.writerTimeoutMs,
        wantJson: false,
      });
      recordUsage(draft, outcome.providerId, 'writer', outcome.usage);
      story.copy = outcome.text.trim();
      writeStoryFile(ctx.root, draft.id, story.slug, 'copy.md', story.copy);
      ctx.log.emit('writer', 'copy', { story: story.slug, chars: story.copy.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(`Writer failed on "${story.slug}": ${msg}`);
      story.copy = story.reports[0]?.summary ?? '';
    }
  });
  ctx.log.emit('WRITE', 'stage_done', { written: toWrite.length });
}

/** CHECK — the copy desk verifies every claim traces to a cited signal. */
export async function stageCheck(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('CHECK', 'stage_start');
  const template = await loadPrompt(ctx.root, 'copydesk');
  const resolved = resolveCopyDesk(ctx.newsroom, ctx.forceProvider);
  const toCheck = draft.stories.filter((s) => s.copy);
  await mapLimit(toCheck, ctx.concurrency, async (story) => {
    try {
      const outcome = await runJob<CopyCheck>({
        role: 'copydesk',
        resolved,
        systemPrompt: renderTemplate(template, { paperName: draft.paperName }),
        userPrompt: checkMaterials(story),
        signals: story.signals,
        timeoutMs: ctx.editorTimeoutMs,
        wantJson: true,
      });
      recordUsage(draft, outcome.providerId, 'copydesk', outcome.usage);
      story.check = normalizeCheck(outcome.data);
      writeStoryFile(
        ctx.root,
        draft.id,
        story.slug,
        'check.json',
        JSON.stringify(story.check, null, 2),
      );
      ctx.log.emit('copydesk', 'checked', { story: story.slug, pass: story.check.pass });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(`Copy desk failed on "${story.slug}": ${msg}`);
    }
  });
  ctx.log.emit('CHECK', 'stage_done', { checked: toCheck.length });
}

/** PROOF — headless auto-approval (the app's Editor's Office replaces this later). */
export async function stageProof(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('PROOF', 'auto_approved', { stories: draft.stories.length });
}

/** PRESS — assemble the finished edition object from the draft. */
export function assembleEdition(draft: EditionDraft): Edition {
  const stories: Story[] = [];
  const briefs = [...draft.briefs];
  const corrections: Correction[] = [];

  for (const story of draft.stories) {
    const call = story.call;
    const sources = sourceRefs(story.signals);
    // Fold copy-desk corrections into the paper's Corrections column.
    for (const c of story.check?.corrections ?? []) {
      corrections.push({ claim: c.claim, reason: c.reason, reporter: story.reporterName });
    }

    if (call?.placement === 'brief' || !story.copy) {
      const lead = story.signals[0];
      briefs.push({
        text: call?.headline ?? story.reports[0]?.summary ?? story.beatName,
        signalId: lead?.id,
        url: lead?.url,
      });
      continue;
    }

    stories.push({
      slug: story.slug,
      beatId: story.beatId,
      beatName: story.beatName,
      headline: call?.headline ?? story.beatName,
      standfirst: call?.standfirst ?? '',
      body: story.copy,
      byline: story.reporterName,
      placement: call?.placement ?? 'below_fold',
      chosenAngle: call?.chosenAngle ?? story.reports[0]?.proposedAngle ?? '',
      rationale: call?.rationale ?? '',
      competingTakes: call?.competingTakes
        ? story.reports.map((r) => ({ reporter: r.reporter, angle: r.proposedAngle }))
        : undefined,
      sources,
      reports: story.reports,
    });
  }

  // Page one first, then below the fold; stable within each group.
  stories.sort((a, b) => placementRank(a.placement) - placementRank(b.placement));

  return {
    id: draft.id,
    number: draft.number,
    date: draft.date,
    paperName: draft.paperName,
    tagline: draft.tagline,
    weatherLine: draft.weatherLine,
    stories,
    briefs,
    editorsLog: draft.editorsLog,
    corrections,
    tokenUsage: draft.tokenUsage,
    generatedAt: new Date().toISOString(),
  };
}

// ---- helpers ---------------------------------------------------------------

function placementRank(p: string): number {
  return p === 'page_one' ? 0 : p === 'below_fold' ? 1 : 2;
}

function sourceRefs(signals: Signal[]): SourceRef[] {
  return signals.map((s) => ({ signalId: s.id, title: s.title, url: s.url }));
}

function reportsForEditor(story: StoryDraft): string {
  return story.reports
    .map((r) => `REPORT by ${r.reporter}\n${JSON.stringify(r, null, 2)}`)
    .join('\n\n');
}

function writerMaterials(story: StoryDraft): string {
  return [
    `Chosen angle: ${story.call?.chosenAngle ?? ''}`,
    `Headline: ${story.call?.headline ?? ''}`,
    '',
    'Filed report:',
    JSON.stringify(story.reports[0] ?? {}, null, 2),
    '',
    'Signals (cite these ids):',
    formatSignals(story.signals),
  ].join('\n');
}

function checkMaterials(story: StoryDraft): string {
  return [
    'COPY:',
    story.copy ?? '',
    '',
    'REPORT (with cited signal ids):',
    JSON.stringify(story.reports[0] ?? {}, null, 2),
    '',
    'SIGNALS available:',
    formatSignals(story.signals),
  ].join('\n');
}

function normalizeReport(data: FiledReport | undefined, story: StoryDraft): FiledReport {
  const validIds = new Set(story.signals.map((s) => s.id));
  const facts = Array.isArray(data?.facts)
    ? data.facts.filter((f) => f && typeof f.claim === 'string' && validIds.has(f.signalId))
    : [];
  return {
    reporter: data?.reporter || story.reporterName,
    summary: data?.summary || story.reports[0]?.summary || story.signals[0]?.title || '',
    facts,
    proposedAngle: data?.proposedAngle || 'Report the development straight.',
    confidence: clamp01(data?.confidence, 0.5),
    urgency: clamp01(data?.urgency, 0),
    notes: data?.notes,
  };
}

function normalizeCall(data: EditorCall | undefined, story: StoryDraft): EditorCall {
  const placements = new Set(['page_one', 'below_fold', 'brief', 'spike']);
  return {
    headline: data?.headline || story.signals[0]?.title || story.beatName,
    standfirst: data?.standfirst || '',
    chosenAngle: data?.chosenAngle || story.reports[0]?.proposedAngle || '',
    placement: placements.has(data?.placement as string)
      ? (data as EditorCall).placement
      : 'below_fold',
    competingTakes: Boolean(data?.competingTakes),
    rationale: data?.rationale || '',
  };
}

function fallbackCall(story: StoryDraft): EditorCall {
  return {
    headline: story.reports[0]?.proposedAngle || story.signals[0]?.title || story.beatName,
    standfirst: '',
    chosenAngle: story.reports[0]?.proposedAngle || '',
    placement: 'below_fold',
    competingTakes: false,
    rationale: 'Editor call unavailable; ran below the fold by default.',
  };
}

function normalizeCheck(data: CopyCheck | undefined): CopyCheck {
  return {
    pass: data?.pass !== false,
    verifiedClaims: Array.isArray(data?.verifiedClaims) ? data.verifiedClaims : [],
    corrections: Array.isArray(data?.corrections) ? data.corrections : [],
    injectionFlags: Array.isArray(data?.injectionFlags) ? data.injectionFlags : [],
  };
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function reportToMarkdown(r: FiledReport): string {
  return [
    `# Filed report — ${r.reporter}`,
    '',
    r.summary,
    '',
    `**Proposed angle:** ${r.proposedAngle}`,
    `**Confidence:** ${r.confidence}  **Urgency:** ${r.urgency}`,
    '',
    '## Facts',
    ...r.facts.map((f) => `- ${f.claim} [${f.signalId}]`),
    r.notes ? `\n**Notes:** ${r.notes}` : '',
  ].join('\n');
}

function callToMarkdown(c: EditorCall): string {
  return [
    `# Editor's call`,
    '',
    `**Headline:** ${c.headline}`,
    `**Standfirst:** ${c.standfirst}`,
    `**Placement:** ${c.placement}`,
    `**Chosen angle:** ${c.chosenAngle}`,
    `**Competing takes:** ${c.competingTakes}`,
    '',
    `**Rationale:** ${c.rationale}`,
  ].join('\n');
}
