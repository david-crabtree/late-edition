import { runSource } from '../adapters/run.js';
import type { BeatConfig } from '../config/types.js';
import type { Correction, Edition, SourceRef, Story } from '../core/edition.js';
import { type Signal, makeSignalId, shortHash } from '../core/signal.js';
import { writeStoryFile } from '../store/edition-store.js';
import { assertNotHalted } from '../store/halt.js';
import { relatedCoverage, scanMorgue, terms } from '../store/morgue.js';
import { paths } from '../store/paths.js';
import { appendToWire } from '../store/wire.js';
import {
  type ResolvedRole,
  resolveCopyDesk,
  resolveEditor,
  resolveReporter,
  resolveReporterPool,
  resolveResearcher,
  resolveWriter,
  runJob,
} from './agents.js';
import { ClarificationNeededError } from './clarify.js';
import type { PipelineContext } from './context.js';
import { mapLimit } from './context.js';
import type {
  CopyCheck,
  EditorCall,
  FiledReport,
  ResearchDossier,
  ResearchFinding,
  TriageResult,
} from './contracts.js';
import {
  type EditionDraft,
  type StoryDraft,
  formatSignals,
  recordUsage,
  slugify,
  sumTokens,
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

/**
 * TRIAGE — for a free-text brief, the Chief decides whether it's clear enough to run before
 * any research is spent. If it's too vague, the run pauses (ClarificationNeededError) with
 * questions for the user; answering resumes it. Source-backed beats and cleared/answered
 * briefs pass straight through.
 */
export async function stageTriage(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('TRIAGE', 'stage_start');
  const briefStory = draft.stories.find((s) => s.signals[0]?.sourceType === 'brief');
  const briefSignal = briefStory?.signals[0];
  if (!ctx.clarify || !briefStory || !briefSignal) {
    ctx.log.emit('TRIAGE', 'skipped', {});
    return;
  }
  // On a resume the user has answered — fold the reply into the brief and carry on.
  if (draft.clarification?.answer) {
    briefSignal.body += `\n\nUser clarification: ${draft.clarification.answer}`;
    ctx.log.emit('TRIAGE', 'clarified', { chars: draft.clarification.answer.length });
    return;
  }
  const template = await loadPrompt(ctx.root, 'triage');
  const resolved = resolveEditor(ctx.newsroom, ctx.forceProvider);
  try {
    const outcome = await runJob<TriageResult>({
      role: 'triage',
      resolved,
      systemPrompt: renderTemplate(template, { paperName: draft.paperName }),
      userPrompt: briefSignal.title,
      signals: briefStory.signals,
      timeoutMs: ctx.editorTimeoutMs,
      wantJson: true,
    });
    recordUsage(draft, outcome.providerId, 'triage', outcome.usage);
    const result = outcome.data;
    const questions = Array.isArray(result?.questions)
      ? result.questions.filter((q) => typeof q === 'string' && q.trim()).slice(0, 3)
      : [];
    if (result?.clear === false && questions.length > 0) {
      draft.clarification = { questions };
      writeStoryFile(
        ctx.root,
        draft.id,
        briefStory.slug,
        'clarification.md',
        clarificationMarkdown(briefSignal.title, questions),
      );
      ctx.log.emit('TRIAGE', 'needs_clarification', { questions: questions.length });
      throw new ClarificationNeededError(draft.id, questions);
    }
    // Clear (or a malformed reply we won't block on). Fold any tightened framing in.
    if (result?.refinedBrief) briefSignal.body += `\n\nChief's framing: ${result.refinedBrief}`;
    ctx.log.emit('TRIAGE', 'clear', {});
  } catch (err) {
    if (err instanceof ClarificationNeededError) throw err;
    // A triage failure must not block the paper — proceed, and note it honestly.
    const msg = err instanceof Error ? err.message : String(err);
    draft.warnings.push(`Triage failed on the brief; ran without a clarity check: ${msg}`);
    ctx.log.emit('TRIAGE', 'error', { error: msg });
  }
}

function clarificationMarkdown(topic: string, questions: string[]): string {
  return [
    '# Awaiting clarification',
    '',
    `The Chief needs answers before running: "${topic}"`,
    '',
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    '',
    'Answer and resume with:',
    '`late-edition run --resume <editionId> --answer "your answer"`',
  ].join('\n');
}

/** How many researcher passes a story gets: a `--research` override, else beat config,
 *  and a free-text brief always gets at least one pass (a bare topic needs digging). */
function researchPassesFor(story: StoryDraft, beat: BeatConfig | undefined, ctx: PipelineContext) {
  if (ctx.research !== undefined) return Math.max(0, ctx.research);
  const configured = beat?.research ?? 0;
  const fromBrief = story.signals[0]?.sourceType === 'brief';
  return fromBrief ? Math.max(1, configured) : configured;
}

interface ResearchTask {
  story: StoryDraft;
  pass: number;
  passes: number;
}

/**
 * RESEARCH — the researcher desk digs up sourced findings on each story's topic before
 * the reporters write. Every finding becomes a `Signal`, so a URL a researcher never
 * actually found can't reach the paper (the copy desk verifies each citation resolves),
 * and the morgue/rendering pick research sources up with no special-casing.
 */
export async function stageResearch(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('RESEARCH', 'stage_start');
  const template = await loadPrompt(ctx.root, 'researcher');

  const tasks: ResearchTask[] = [];
  for (const story of draft.stories) {
    const beat = ctx.newsroom.beats.find((b) => b.id === story.beatId);
    const passes = researchPassesFor(story, beat, ctx);
    for (let pass = 0; pass < passes; pass++) tasks.push({ story, pass, passes });
  }
  if (tasks.length === 0) {
    ctx.log.emit('RESEARCH', 'stage_done', { researched: 0 });
    return;
  }

  const collected = await mapLimit(tasks, ctx.concurrency, async (t) => {
    assertNotHalted(ctx.root);
    const resolved = resolveResearcher(ctx.newsroom, t.story.beatId, ctx.forceProvider);
    if (!resolved.provider.capabilities.webSearch) {
      draft.warnings.push(
        `Researcher (${resolved.providerId}) can't browse the web — findings on "${t.story.slug}" may be from model memory only, not live sources.`,
      );
    }
    const topic = t.story.signals[0]?.title ?? t.story.beatName;
    const beat = ctx.newsroom.beats.find((b) => b.id === t.story.beatId);
    const systemPrompt = renderTemplate(template, {
      paperName: draft.paperName,
      beatName: t.story.beatName,
      style: ctx.newsroom.style,
      topic,
      maxFindings: String(ctx.maxFindings ?? beat?.maxFindings ?? DEFAULT_MAX_FINDINGS),
    });
    ctx.log.emit('researcher', 'leave_desk', { story: t.story.slug, pass: t.pass + 1 });
    try {
      const outcome = await runJob<ResearchDossier>({
        role: 'researcher',
        resolved,
        systemPrompt,
        userPrompt: formatSignals(t.story.signals),
        signals: t.story.signals,
        timeoutMs: ctx.researcherTimeoutMs,
        wantJson: true,
      });
      recordUsage(draft, outcome.providerId, 'researcher', outcome.usage);
      const findings = normalizeFindings(outcome.data);
      ctx.log.emit('researcher', 'filed', { story: t.story.slug, findings: findings.length });
      return { story: t.story, findings };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(
        `Researcher (${resolved.providerId}) failed on "${t.story.slug}": ${msg}`,
      );
      ctx.log.emit('researcher', 'error', { story: t.story.slug, error: msg });
      return { story: t.story, findings: [] as ResearchFinding[] };
    }
  });

  // Fold findings into each story's signals: dedupe against what's there and each other,
  // cap per story to bound downstream tokens, and archive them to the wire like any signal.
  for (const story of draft.stories) {
    const beat = ctx.newsroom.beats.find((b) => b.id === story.beatId);
    const cap = ctx.maxFindings ?? beat?.maxFindings ?? DEFAULT_MAX_FINDINGS;
    const found = collected.filter((c) => c.story === story).flatMap((c) => c.findings);
    const seen = new Set(story.signals.map((s) => s.id));
    const added: Signal[] = [];
    for (const signal of found.map((f) => findingToSignal(f, ctx.now))) {
      if (seen.has(signal.id)) continue;
      seen.add(signal.id);
      added.push(signal);
      if (added.length >= cap) break;
    }
    if (added.length === 0) continue;
    story.signals.push(...added);
    appendToWire(ctx.root, added);
    writeStoryFile(ctx.root, draft.id, story.slug, 'research.md', dossierMarkdown(found, added));
    ctx.log.emit('researcher', 'merged', { story: story.slug, added: added.length });
  }
  ctx.log.emit('RESEARCH', 'stage_done', { researched: tasks.length });
}

const DEFAULT_MAX_FINDINGS = 6;

/** Coerce whatever the researcher returned into clean findings with a real URL. */
export function normalizeFindings(data: ResearchDossier | undefined): ResearchFinding[] {
  const raw = Array.isArray(data?.findings) ? data.findings : [];
  const out: ResearchFinding[] = [];
  for (const f of raw) {
    const title = typeof f?.title === 'string' ? f.title.trim() : '';
    const url = typeof f?.url === 'string' ? f.url.trim() : '';
    // A finding with no usable source URL is exactly the fabrication risk we're guarding
    // against — drop it rather than let an unsourced claim into the paper.
    if (!title || !/^https?:\/\//i.test(url)) continue;
    out.push({
      title,
      summary: typeof f.summary === 'string' ? f.summary.trim() : '',
      url,
      published: typeof f.published === 'string' ? f.published : undefined,
      relevance: clamp01(f.relevance, 0.5),
    });
  }
  return out;
}

/** Turn one sourced finding into a normal Signal the rest of the pipeline can cite. */
export function findingToSignal(f: ResearchFinding, now: Date): Signal {
  const hash = shortHash('research', f.url, f.title);
  return {
    id: makeSignalId('research', hash),
    sourceId: 'research',
    sourceType: 'research',
    timestamp: f.published ?? now.toISOString(),
    title: f.title,
    body: f.summary,
    url: f.url,
    hash,
    meta: { relevance: f.relevance },
  };
}

function dossierMarkdown(found: ResearchFinding[], added: Signal[]): string {
  const kept = new Set(added.map((s) => s.url));
  return [
    '# Research dossier',
    '',
    `${found.length} finding(s) filed; ${added.length} kept as citable sources.`,
    '',
    ...added.map((s) => `- **${s.title}** [${s.id}]\n  ${s.body}\n  ${s.url ?? ''}`.trimEnd()),
    found.length > added.length
      ? `\n_${found.length - kept.size} finding(s) were duplicates or over the cap._`
      : '',
  ].join('\n');
}

interface ReportTask {
  story: StoryDraft;
  resolved: ResolvedRole;
  label: string;
  index: number;
  total: number;
}

/** REPORT — one or more reporters investigate each story and file independent reports. */
export async function stageReport(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('REPORT', 'stage_start');
  const template = await loadPrompt(ctx.root, 'reporter');

  // Build every (story × reporter) job up front so concurrency is bounded globally.
  const tasks: ReportTask[] = [];
  for (const story of draft.stories) {
    const beat = ctx.newsroom.beats.find((b) => b.id === story.beatId);
    const pool = resolveReporterPool(ctx.newsroom, story.beatId, {
      count: beat?.angles ?? 1,
      mixProviders: beat?.mixProviders ?? false,
      force: ctx.forceProvider,
    });
    const providersDistinct = new Set(pool.map((r) => r.providerId)).size === pool.length;
    if (pool.length > 1 && beat?.mixProviders && !providersDistinct) {
      draft.warnings.push(
        `Beat "${story.beatId}" asked to mix providers but only "${pool[0]?.providerId}" is available; angles will vary by directive only.`,
      );
    }
    pool.forEach((resolved, index) => {
      // Distinct providers label by provider; same-provider desks label by desk number.
      const label =
        pool.length <= 1
          ? story.reporterName
          : providersDistinct
            ? `${story.reporterName} · ${resolved.providerId}`
            : `${story.reporterName} · desk ${index + 1}`;
      tasks.push({ story, resolved, label, index, total: pool.length });
    });
  }

  // Token cap: hold as many reporters as the remaining budget can't afford (a rough
  // per-reporter estimate keeps it deterministic even though the desks run concurrently).
  if (ctx.tokenCap) {
    const perReporter = 2000;
    const affordable = Math.max(0, Math.floor((ctx.tokenCap - sumTokens(draft)) / perReporter));
    for (const held of tasks.splice(affordable)) {
      draft.warnings.push(`Token cap (${ctx.tokenCap}) — held a reporter on "${held.story.slug}".`);
      ctx.log.emit('reporter', 'capped', {
        story: held.story.slug,
        reporter: held.label,
        cap: ctx.tokenCap,
      });
    }
  }

  const filed = await mapLimit(tasks, ctx.concurrency, async (t) => {
    assertNotHalted(ctx.root);
    ctx.log.emit('reporter', 'leave_desk', { story: t.story.slug, reporter: t.label });
    const systemPrompt = renderTemplate(template, {
      reporterName: t.label,
      paperName: draft.paperName,
      beatName: t.story.beatName,
      style: ctx.newsroom.style,
      persona: personaBlock(ctx, t.story.reporterName),
      angleDirective: angleDirective(t.index, t.total),
    });
    try {
      const outcome = await runJob<FiledReport>({
        role: 'reporter',
        resolved: t.resolved,
        systemPrompt,
        userPrompt: formatSignals(t.story.signals),
        signals: t.story.signals,
        timeoutMs: ctx.reporterTimeoutMs,
        wantJson: true,
      });
      recordUsage(draft, outcome.providerId, 'reporter', outcome.usage);
      const report = normalizeReport(outcome.data, t.story);
      report.reporter = t.label;
      writeStoryFile(
        ctx.root,
        draft.id,
        t.story.slug,
        `reports/${slugify(t.label)}.md`,
        reportToMarkdown(report),
      );
      ctx.log.emit('reporter', 'filed', {
        story: t.story.slug,
        reporter: t.label,
        confidence: report.confidence,
        angle: report.proposedAngle,
      });
      return { story: t.story, report };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(
        `Reporter (${t.resolved.providerId}) failed on "${t.story.slug}": ${msg}`,
      );
      ctx.log.emit('reporter', 'error', { story: t.story.slug, error: msg });
      return null;
    }
  });

  for (const f of filed) if (f) f.story.reports.push(f.report);
  // Drop stories that produced no report at all.
  draft.stories = draft.stories.filter((s) => s.reports.length > 0);
  ctx.log.emit('REPORT', 'stage_done', { stories: draft.stories.length });
}

function angleDirective(index: number, total: number): string {
  if (total <= 1) return 'Report it straight, in your own voice.';
  if (index === 0) {
    return 'You are the first desk on this story. Give your best straight read of what happened.';
  }
  return (
    'You are an independent second desk. You have NOT seen the other desk’s report. ' +
    'Look hard for the angle an obvious read would miss — a skeptical, contrarian, or ' +
    'overlooked take. Do not converge on the safe story; if you think it is being over-read, say so.'
  );
}

/** ANGLES — collect the independent angle memos and note where reporters disagree. */
export async function stageAngles(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('ANGLES', 'stage_start');
  for (const story of draft.stories) {
    const angles = story.reports.map((r) => ({
      reporter: r.reporter,
      angle: r.proposedAngle,
      confidence: r.confidence,
      urgency: r.urgency,
    }));
    const disagreement = story.reports.length > 1 && detectDisagreement(story.reports);
    writeStoryFile(
      ctx.root,
      draft.id,
      story.slug,
      'angles.json',
      JSON.stringify({ angles, disagreement }, null, 2),
    );
    ctx.log.emit('ANGLES', 'angles', {
      story: story.slug,
      count: angles.length,
      disagreement,
    });
  }
  ctx.log.emit('ANGLES', 'stage_done', { stories: draft.stories.length });
}

/** Do the reporters propose materially different angles? */
function detectDisagreement(reports: FiledReport[]): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  const angles = new Set(reports.map((r) => norm(r.proposedAngle)));
  if (angles.size >= 2) return true;
  const confidences = reports.map((r) => r.confidence);
  return Math.max(...confidences) - Math.min(...confidences) >= 0.25;
}

/** CALL — the managing editor sets headline, angle and placement, then the front page. */
export async function stageCall(draft: EditionDraft, ctx: PipelineContext): Promise<void> {
  ctx.log.emit('CALL', 'stage_start');
  const template = await loadPrompt(ctx.root, 'editor');
  const editor = resolveEditor(ctx.newsroom, ctx.forceProvider);

  for (const story of draft.stories) {
    assertNotHalted(ctx.root);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(`Editor failed on "${story.slug}": ${msg}`);
      story.call = fallbackCall(story);
    }
    // Never silently merge a genuine disagreement: if the desks split, run both takes.
    if (
      story.call &&
      !story.call.competingTakes &&
      story.reports.length > 1 &&
      detectDisagreement(story.reports)
    ) {
      story.call.competingTakes = true;
      story.call.rationale =
        `${story.call.rationale} The desks split on the angle, so this runs as Competing Takes.`.trim();
      if (story.call.placement === 'brief' || story.call.placement === 'spike') {
        story.call.placement = 'below_fold';
      }
    }
    writeStoryFile(ctx.root, draft.id, story.slug, 'call.md', callToMarkdown(story.call));
    ctx.log.emit('editor', 'call', {
      story: story.slug,
      placement: story.call.placement,
      competingTakes: story.call.competingTakes,
    });
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
    assertNotHalted(ctx.root);
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
    assertNotHalted(ctx.root);
    // Deterministic verification always runs: every [signalId] cited in the copy must
    // resolve to a real signal for this story. This holds even if the LLM copy desk is
    // weak or unavailable, and it catches links/citations injected by source material.
    const deterministic = verifyCopyCitations(story);
    let check = deterministic;
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
      check = mergeChecks(normalizeCheck(outcome.data), deterministic);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      draft.warnings.push(
        `Copy desk (LLM) failed on "${story.slug}"; kept deterministic check: ${msg}`,
      );
    }
    story.check = check;
    writeStoryFile(ctx.root, draft.id, story.slug, 'check.json', JSON.stringify(check, null, 2));
    ctx.log.emit('copydesk', 'checked', {
      story: story.slug,
      pass: check.pass,
      corrections: check.corrections.length,
    });
  });

  applyStopThePress(draft, ctx);
  linkMorgue(draft, ctx);
  ctx.log.emit('CHECK', 'stage_done', { checked: toCheck.length });
}

/** Link each story to related past coverage from the morgue (the archive on disk). */
function linkMorgue(draft: EditionDraft, ctx: PipelineContext): void {
  const archive = scanMorgue(ctx.root);
  if (archive.length === 0) return;
  for (const story of draft.stories) {
    const storyTerms = terms(
      `${story.call?.headline ?? story.beatName} ${story.beatName} ${story.reports
        .map((r) => r.proposedAngle)
        .join(' ')}`,
    );
    const related = relatedCoverage(archive, { terms: storyTerms, beatId: story.beatId }, draft.id);
    if (related.length > 0) {
      story.morgue = related.map((e) => ({
        editionId: e.editionId,
        headline: e.headline,
        date: e.date,
      }));
    }
  }
}

/**
 * STOP THE PRESS (headless). A finding whose urgency clears the beat's threshold AND is
 * corroborated by the copy desk (claims supported, nothing flagged as injected) is
 * promoted to page one with a kicker, and the event is logged. The app's interactive
 * interrupt card (run it / fold it / not news) replaces this auto-promotion later.
 */
function applyStopThePress(draft: EditionDraft, ctx: PipelineContext): void {
  for (const story of draft.stories) {
    const beat = ctx.newsroom.beats.find((b) => b.id === story.beatId);
    const threshold = beat?.urgencyThreshold ?? ctx.urgencyThreshold;
    const maxUrgency = story.reports.reduce((m, r) => Math.max(m, r.urgency), 0);
    const corroborated =
      story.check !== undefined &&
      story.check.pass !== false &&
      story.check.injectionFlags.length === 0;
    if (maxUrgency >= threshold && corroborated && story.copy) {
      story.stopThePress = true;
      if (story.call) story.call.placement = 'page_one';
      draft.editorsLog.push(
        `STOP THE PRESS: "${story.call?.headline ?? story.beatName}" cleared urgency ${maxUrgency.toFixed(
          2,
        )} (≥ ${threshold}) and was corroborated — promoted to page one.`,
      );
      ctx.log.emit('CHECK', 'stop_the_press', {
        story: story.slug,
        urgency: maxUrgency,
        threshold,
      });
    }
  }
}

/** Verify every `[signalId]` cited in the copy resolves to a real signal for this story. */
export function verifyCopyCitations(story: StoryDraft): CopyCheck {
  const validIds = new Set(story.signals.map((s) => s.id));
  const copy = story.copy ?? '';
  const cited = new Set<string>();
  for (const m of copy.matchAll(/\[([^\]\s]+:[0-9a-f]{6,})\]/g)) {
    if (m[1]) cited.add(m[1]);
  }
  const corrections: CopyCheck['corrections'] = [];
  const injectionFlags: string[] = [];
  for (const id of cited) {
    if (!validIds.has(id)) {
      corrections.push({
        claim: `Citation [${id}]`,
        reason: 'cited source is not in this story’s materials',
      });
      injectionFlags.push(`Unknown citation [${id}] — possible fabricated or injected source.`);
    }
  }
  // A story that makes claims but cites nothing verifiable is itself worth flagging.
  if (cited.size === 0 && copy.trim().length > 0 && story.signals.length > 0) {
    injectionFlags.push('Copy cited no verifiable signal ids.');
  }
  return {
    pass: corrections.length === 0,
    verifiedClaims: [...cited].map((id) => ({
      claim: `cited [${id}]`,
      signalId: id,
      supported: validIds.has(id),
    })),
    corrections,
    injectionFlags,
  };
}

/** Combine the LLM copy check with the deterministic one; the deterministic one wins on `pass`. */
function mergeChecks(llm: CopyCheck, det: CopyCheck): CopyCheck {
  const seen = new Set(det.corrections.map((c) => c.claim));
  const corrections = [...det.corrections, ...llm.corrections.filter((c) => !seen.has(c.claim))];
  return {
    pass: det.pass && llm.pass,
    verifiedClaims: [...det.verifiedClaims, ...llm.verifiedClaims],
    corrections,
    injectionFlags: [...new Set([...det.injectionFlags, ...llm.injectionFlags])],
  };
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
      stopThePress: story.stopThePress,
      morgue: story.morgue,
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
    lateExtra: draft.lateExtra,
    assignmentId: draft.assignmentId,
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
  // The editor's `brief:` instruction is not a source — keep it out of the paper's citations.
  return signals
    .filter((s) => s.sourceType !== 'brief')
    .map((s) => ({ signalId: s.id, title: s.title, url: s.url }));
}

function reportsForEditor(story: StoryDraft): string {
  return story.reports
    .map((r) => `REPORT by ${r.reporter}\n${JSON.stringify(r, null, 2)}`)
    .join('\n\n');
}

function writerMaterials(story: StoryDraft): string {
  const competing = story.call?.competingTakes;
  return [
    `Chosen angle: ${story.call?.chosenAngle ?? ''}`,
    `Headline: ${story.call?.headline ?? ''}`,
    competing
      ? 'NOTE: the desks disagreed. Write the body straight down the middle and let both\nreads stand — do not pick a winner; the paper runs the takes side by side.'
      : '',
    '',
    `Filed report(s) (${story.reports.length}):`,
    story.reports.map((r) => JSON.stringify(r, null, 2)).join('\n\n'),
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
    'REPORT(S) (with cited signal ids):',
    story.reports.map((r) => JSON.stringify(r, null, 2)).join('\n\n'),
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
