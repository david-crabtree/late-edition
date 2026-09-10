import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../adapters/index.js'; // register built-in source adapters (side-effect import)
import { loadNewsroom } from '../config/newsroom.js';
import type { Newsroom } from '../config/types.js';
import type { Edition } from '../core/edition.js';
import { type Signal, makeSignalId, shortHash } from '../core/signal.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import { nextEditionId, writeEdition } from '../store/edition-store.js';
import { PipelineHaltError, isHalted } from '../store/halt.js';
import { EditionLog } from '../store/log.js';
import { paths } from '../store/paths.js';
import { ClarificationNeededError } from './clarify.js';
import type { PipelineContext } from './context.js';
import {
  type EditionDraft,
  type Stage,
  nextStage,
  slugify,
  sumCostUsd,
  sumTokens,
} from './draft.js';
import {
  assembleEdition,
  stageAngles,
  stageAssign,
  stageCall,
  stageCheck,
  stageProof,
  stageReport,
  stageResearch,
  stageTriage,
  stageWire,
  stageWrite,
} from './stages.js';

export interface RunOptions {
  /** Newsroom root (dir containing `newsroom/`). */
  root: string;
  /** Force one provider for every role (e.g. 'fake' for a token-free run). */
  forceProvider?: string;
  /** Resume an in-flight edition by id instead of starting a new one. */
  resumeId?: string;
  /** A free-text topic to put on the front page — seeds one synthetic story and starts at ASSIGN (no WIRE). */
  brief?: string;
  /** Hard cap on total tokens for this edition (overrides config). */
  tokenCap?: number;
  /** Override researcher passes for every story (0 disables research; overrides beat config). */
  research?: number;
  /** Let the Chief pause a vague brief to ask for clarification (default true). */
  clarify?: boolean;
  /** The user's answer to a prior clarification request (used when resuming). */
  clarificationAnswer?: string;
  researcherTimeoutMs?: number;
  reporterTimeoutMs?: number;
  editorTimeoutMs?: number;
  writerTimeoutMs?: number;
  concurrency?: number;
  now?: Date;
}

export interface RunResult {
  edition: Edition;
  editionDir: string;
  editionId: string;
  warnings: string[];
}

const STAGE_RUNNERS: Record<
  Exclude<Stage, 'PRESS' | 'DONE'>,
  (draft: EditionDraft, ctx: PipelineContext) => Promise<void> | void
> = {
  WIRE: stageWire,
  ASSIGN: stageAssign,
  TRIAGE: stageTriage,
  RESEARCH: stageResearch,
  REPORT: stageReport,
  ANGLES: stageAngles,
  CALL: stageCall,
  WRITE: stageWrite,
  CHECK: stageCheck,
  PROOF: stageProof,
};

/** Run (or resume) one edition through WIRE → PRESS. */
export async function runEdition(opts: RunOptions): Promise<RunResult> {
  const newsroom = await loadNewsroom(opts.root);
  const now = opts.now ?? new Date();
  const p = paths(opts.root);

  const draft = opts.resumeId
    ? loadDraft(opts.root, opts.resumeId)
    : opts.brief
      ? briefDraft(opts.root, newsroom, opts.brief, now)
      : newDraft(opts.root, newsroom.config.paper.name, newsroom.config.paper.tagline, now);

  const logFile = join(p.editionDir(draft.id), 'log.jsonl');
  const ctx: PipelineContext = {
    newsroom,
    root: opts.root,
    forceProvider: opts.forceProvider,
    research: opts.research,
    clarify: opts.clarify !== false,
    researcherTimeoutMs: opts.researcherTimeoutMs ?? 180_000,
    reporterTimeoutMs: opts.reporterTimeoutMs ?? 120_000,
    editorTimeoutMs: opts.editorTimeoutMs ?? 120_000,
    writerTimeoutMs: opts.writerTimeoutMs ?? 120_000,
    concurrency: opts.concurrency ?? 3,
    urgencyThreshold: newsroom.config.edition?.urgencyThreshold ?? 0.85,
    tokenCap: opts.tokenCap ?? newsroom.config.edition?.tokenCap,
    log: new EditionLog(logFile),
    now,
  };
  if (opts.brief) ctx.log.emit('ASSIGN', 'brief', { topic: opts.brief });

  // A resume that carries an answer to an earlier clarification request records it so
  // TRIAGE folds it into the brief and proceeds instead of asking again.
  if (opts.clarificationAnswer) {
    draft.clarification = {
      questions: draft.clarification?.questions ?? [],
      answer: opts.clarificationAnswer,
    };
  }

  const persist = () => saveDraft(opts.root, draft);
  persist();

  while (draft.stage !== 'DONE') {
    const stage = draft.stage;
    // The stop switch, checked at every stage boundary: leave the edition idle & resumable.
    if (isHalted(opts.root)) {
      persist();
      ctx.log.emit(stage, 'halted', {});
      throw new PipelineHaltError(draft.id);
    }
    if (stage === 'PRESS') {
      const edition = assembleEdition(draft);
      const editionDir = writeEdition(opts.root, edition, {
        markdown: renderMarkdown(edition),
        html: renderHtml(edition),
      });
      draft.stage = 'DONE';
      persist();
      ctx.log.emit('PRESS', 'printed', { stories: edition.stories.length, dir: editionDir });
      writeReel(opts.root, draft, edition, ctx.tokenCap);
      return { edition, editionDir, editionId: draft.id, warnings: draft.warnings };
    }

    try {
      await STAGE_RUNNERS[stage](draft, ctx);
    } catch (err) {
      persist(); // keep the stage so `resume` can retry (or continue after a halt/clarify)
      if (err instanceof PipelineHaltError) {
        ctx.log.emit(stage, 'halted', {});
        throw new PipelineHaltError(draft.id); // carry the edition id up for a clean resume hint
      }
      if (err instanceof ClarificationNeededError) {
        ctx.log.emit(stage, 'awaiting_clarification', { questions: err.questions.length });
        throw err;
      }
      ctx.log.emit(stage, 'fatal', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    draft.stage = nextStage(stage);
    persist();
  }

  // Reached only if resumed at DONE — re-assemble from the persisted draft.
  const edition = assembleEdition(draft);
  const editionDir = writeEdition(opts.root, edition, {
    markdown: renderMarkdown(edition),
    html: renderHtml(edition),
  });
  return { edition, editionDir, editionId: draft.id, warnings: draft.warnings };
}

function newDraft(
  root: string,
  paperName: string,
  tagline: string | undefined,
  now: Date,
): EditionDraft {
  const date = now.toISOString().slice(0, 10);
  const { id, number } = nextEditionId(root, date);
  return {
    id,
    number,
    date,
    paperName,
    tagline,
    stage: 'WIRE',
    stories: [],
    briefs: [],
    editorsLog: [],
    tokenUsage: [],
    warnings: [],
  };
}

/** Seed one synthetic story from a free-text brief and start at ASSIGN (skips WIRE). */
function briefDraft(root: string, newsroom: Newsroom, topic: string, now: Date): EditionDraft {
  const date = now.toISOString().slice(0, 10);
  const { id, number } = nextEditionId(root, date);
  // A brief is topic-agnostic: use a synthetic `brief` beat so it never inherits an
  // arbitrary configured beat's angles/research/name (which would run extra reporters and
  // mislabel the beat in every agent prompt). Staff resolve via their `default` desk, or a
  // `brief:` override if the newsroom defines one. The byline persona is still borrowed.
  const beat = newsroom.beats[0];
  const beatId = 'brief';
  const beatName = 'The Newsdesk';
  const reporterName = beat?.reporter ?? 'The Newsdesk';
  const hash = shortHash('brief', topic, date);
  const signal: Signal = {
    id: makeSignalId('brief', hash),
    sourceId: 'brief',
    sourceType: 'brief',
    timestamp: now.toISOString(),
    title: topic,
    body: `Editor's brief — front-page it: "${topic}". Investigate, tie every claim to a source, and file what stands up.`,
    hash,
  };
  return {
    id,
    number,
    date,
    paperName: newsroom.config.paper.name,
    tagline: newsroom.config.paper.tagline,
    stage: 'ASSIGN',
    stories: [
      {
        slug: slugify(topic),
        beatId,
        beatName,
        signals: [signal],
        reporterName,
        reporterProviderId: '',
        reports: [],
      },
    ],
    briefs: [],
    editorsLog: [],
    tokenUsage: [],
    warnings: [],
  };
}

/** Project the timed log + edition into a self-contained `reel.json` the animation can replay. */
function writeReel(root: string, draft: EditionDraft, edition: Edition, cap?: number): void {
  const dir = paths(root).editionDir(draft.id);
  let events: unknown[] = [];
  try {
    events = readFileSync(join(dir, 'log.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    /* no log to project */
  }
  const byRole: Record<string, number> = {};
  const costByRole: Record<string, number> = {};
  for (const u of draft.tokenUsage) {
    byRole[u.role] = (byRole[u.role] ?? 0) + (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
    if (u.costUsd) costByRole[u.role] = (costByRole[u.role] ?? 0) + u.costUsd;
  }
  const reel = {
    edition: draft.id,
    date: draft.date,
    paper: draft.paperName,
    topic: draft.stories[0]?.signals[0]?.title ?? edition.stories[0]?.headline ?? '',
    stories: edition.stories.map((s) => ({
      slug: s.slug,
      headline: s.headline,
      standfirst: s.standfirst,
      byline: s.byline,
      stopThePress: s.stopThePress ?? false,
    })),
    tokens: { total: sumTokens(draft), cap: cap ?? null, byRole },
    cost: { total: sumCostUsd(draft), byRole: costByRole },
    warnings: draft.warnings,
    events,
  };
  writeFileSync(join(dir, 'reel.json'), JSON.stringify(reel, null, 2), 'utf8');
}

function draftFile(root: string, id: string): string {
  return join(paths(root).editionDir(id), 'pipeline.json');
}

function saveDraft(root: string, draft: EditionDraft): void {
  mkdirSync(paths(root).editionDir(draft.id), { recursive: true });
  writeFileSync(draftFile(root, draft.id), JSON.stringify(draft, null, 2), 'utf8');
}

function loadDraft(root: string, id: string): EditionDraft {
  const file = draftFile(root, id);
  if (!existsSync(file)) {
    throw new Error(`Cannot resume: no pipeline state at ${file}.`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as EditionDraft;
}
