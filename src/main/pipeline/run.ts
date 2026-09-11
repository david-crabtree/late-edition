import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../adapters/index.js'; // register built-in source adapters (side-effect import)
import { loadNewsroom } from '../config/newsroom.js';
import type { Newsroom } from '../config/types.js';
import type { Edition } from '../core/edition.js';
import type { CopyShape } from '../core/formats.js';
import { type Signal, makeSignalId, shortHash } from '../core/signal.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import { nextEditionId, writeEdition } from '../store/edition-store.js';
import { PipelineHaltError, isHalted } from '../store/halt.js';
import { EditionLog, type LogEvent } from '../store/log.js';
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
  stageReverify,
  stageTriage,
  stageWire,
  stageWrite,
} from './stages.js';
import { VerificationNeededError, unverifiedNote } from './verify.js';

export interface RunOptions {
  /** Newsroom root (dir containing `newsroom/`). */
  root: string;
  /** Force one provider for every role (e.g. 'fake' for a token-free run). */
  forceProvider?: string;
  /** Resume an in-flight edition by id instead of starting a new one. */
  resumeId?: string;
  /** A free-text topic to put on the front page — seeds one synthetic story and starts at ASSIGN (no WIRE). */
  brief?: string;
  /** The standing assignment this run belongs to (tags the edition for its history). */
  assignmentId?: string;
  /** Prior-coverage context for a standing assignment — folded into the brief so the run builds on it. */
  priorContext?: string;
  /** Hard cap on total tokens for this edition (overrides config). */
  tokenCap?: number;
  /** Override researcher passes for every story (0 disables research; overrides beat config). */
  research?: number;
  /** Override the cap on findings kept per story (else beat config or the default). */
  maxFindings?: number;
  /** Let the Chief pause a vague brief to ask for clarification (default true). */
  clarify?: boolean;
  /**
   * Which paper this edition is written as — the house paper, a red-top, a broadsheet, a
   * business daily, an agency wire, a tech site, or a post — plus how long it runs. It
   * reaches the reporter, the editor and the writer, so the angle, the headline and the
   * voice all move with it. It never reaches the researcher: the reporting is the same
   * reporting whichever paper runs it. Unset writes the house paper, which is what every
   * edition did before this existed.
   */
  shape?: CopyShape;
  /** The user's answer to a prior clarification request (used when resuming). */
  clarificationAnswer?: string;
  /**
   * Let a desk that doesn't trust its reporting stop and ask whether to go back and check.
   * Off by default — an unattended run must never sit blocked waiting for an answer.
   */
  askToVerify?: boolean;
  /**
   * The answer to the Chief's mid-run question, on resume. `true` sends the researcher back
   * over that story; `false` runs it as it stands and says so in the Editor's Log.
   */
  verifyAnswer?: boolean;
  /** Switch the picture desk on: a shot list, caption and alt text per story. Off by default. */
  photoDesk?: boolean;
  /**
   * Run one watched beat off what the field desk already found, rather than fetching the
   * wire again. The signals come from the beat's spike, so no source is re-polled (the
   * diff state is already consumed) and no researcher runs — the digging happened when
   * the original edition was filed.
   */
  watchBeat?: { beatId: string; beatName: string; signals: Signal[] };
  /** Live event subscriber — every pipeline event as it happens (for a desktop UI to animate). */
  onEvent?: (ev: LogEvent) => void;
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
    : opts.watchBeat
      ? watchDraft(opts.root, newsroom, opts.watchBeat, now, opts)
      : opts.brief
        ? briefDraft(opts.root, newsroom, opts.brief, now, opts)
        : newDraft(opts.root, newsroom.config.paper.name, newsroom.config.paper.tagline, now);

  // Which paper this is written as, recorded on the draft so it survives a resume and
  // reaches the renderer — a post must not come out laid out as a front page.
  if (opts.shape?.outlet) draft.outlet = opts.shape.outlet;
  // And the other way on a resume: an edition that is half written as one paper must not
  // finish as another because whoever resumed it did not say which again. The draft's own
  // record wins over nothing, and an explicit shape still wins over the draft.
  const shape: CopyShape | undefined =
    opts.shape ?? (draft.outlet ? { outlet: draft.outlet as CopyShape['outlet'] } : undefined);

  const logFile = join(p.editionDir(draft.id), 'log.jsonl');
  const ctx: PipelineContext = {
    newsroom,
    root: opts.root,
    forceProvider: opts.forceProvider,
    research: opts.research,
    maxFindings: opts.maxFindings,
    clarify: opts.clarify !== false,
    shape,
    askToVerify: opts.askToVerify === true,
    photoDesk: opts.photoDesk === true,
    researcherTimeoutMs: opts.researcherTimeoutMs ?? 180_000,
    reporterTimeoutMs: opts.reporterTimeoutMs ?? 120_000,
    editorTimeoutMs: opts.editorTimeoutMs ?? 120_000,
    writerTimeoutMs: opts.writerTimeoutMs ?? 120_000,
    concurrency: opts.concurrency ?? 3,
    urgencyThreshold: newsroom.config.edition?.urgencyThreshold ?? 0.85,
    tokenCap: opts.tokenCap ?? newsroom.config.edition?.tokenCap,
    log: new EditionLog(logFile, opts.onEvent),
    now,
  };
  const persist = () => saveDraft(opts.root, draft);
  if (opts.brief) ctx.log.emit('ASSIGN', 'brief', { topic: opts.brief });

  // A resume that carries an answer to an earlier clarification request records it so
  // TRIAGE folds it into the brief and proceeds instead of asking again.
  if (opts.clarificationAnswer) {
    draft.clarification = {
      questions: draft.clarification?.questions ?? [],
      answer: opts.clarificationAnswer,
    };
  }

  // A resume that answers the Chief's mid-run question. Recording the decision is what
  // stops the same story being asked about again, whichever way it went; "no" is written
  // into the Editor's Log so the paper says plainly that the story ran unchecked.
  if (draft.verify && opts.verifyAnswer !== undefined) {
    const decision = {
      slug: draft.verify.slug,
      question: draft.verify.question,
      verified: opts.verifyAnswer === true,
    };
    draft.verifyDecisions = [...(draft.verifyDecisions ?? []), decision];
    draft.verify = undefined;
    ctx.log.emit('REPORT', 'decided', { story: decision.slug, verified: decision.verified });
    if (decision.verified) {
      await stageReverify(draft, ctx);
    } else {
      draft.editorsLog.push(unverifiedNote(decision));
    }
    persist();
  }

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
      // A desk waiting on the Chief. The draft is already saved with the pending question,
      // so answering resumes from exactly here.
      if (err instanceof VerificationNeededError) {
        ctx.log.emit(stage, 'awaiting_decision', { story: err.slug });
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
function briefDraft(
  root: string,
  newsroom: Newsroom,
  topic: string,
  now: Date,
  opts: RunOptions,
): EditionDraft {
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
  const hash = shortHash('brief', topic, date, opts.priorContext ?? '');
  const priorBlock = opts.priorContext
    ? `\n\nPrior coverage of this ongoing assignment (newest first):\n${opts.priorContext}\nReport what is NEW or has CHANGED since — advance the story, do not repeat what is already covered.`
    : '';
  const signal: Signal = {
    id: makeSignalId('brief', hash),
    sourceId: 'brief',
    sourceType: 'brief',
    timestamp: now.toISOString(),
    title: topic,
    body: `Editor's brief — front-page it: "${topic}". Investigate, tie every claim to a source, and file what stands up.${priorBlock}`,
    hash,
  };
  return {
    id,
    number,
    date,
    paperName: newsroom.config.paper.name,
    tagline: newsroom.config.paper.tagline,
    assignmentId: opts.assignmentId,
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

/**
 * A draft seeded from what the field desk noticed. Starts at ASSIGN, like a brief, because
 * WIRE has effectively already run — the adapters diffed these pages and the changes are
 * on the spike. Re-polling here would return nothing, since the seen-state is consumed.
 */
function watchDraft(
  root: string,
  newsroom: Newsroom,
  watch: { beatId: string; beatName: string; signals: Signal[] },
  now: Date,
  opts: RunOptions,
): EditionDraft {
  const date = now.toISOString().slice(0, 10);
  const { id, number } = nextEditionId(root, date);
  const hash = shortHash('watch', watch.beatId, date);
  // A framing signal so the desk knows this is a follow-up on a page it has covered before,
  // and should report the change rather than re-introduce the subject.
  const framing: Signal = {
    id: makeSignalId('watch', hash),
    sourceId: 'field',
    sourceType: 'brief',
    timestamp: now.toISOString(),
    title: `What changed on "${watch.beatName}"`,
    body: [
      'The field desk has been watching these sources since this story last ran.',
      `${watch.signals.length} of them changed.`,
      'Report WHAT CHANGED and what it means — do not re-introduce the subject from',
      'scratch, and do not repeat prior coverage.',
      opts.priorContext ? `\n\nPrior coverage (newest first):\n${opts.priorContext}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    hash,
  };
  return {
    id,
    number,
    date,
    paperName: newsroom.config.paper.name,
    tagline: newsroom.config.paper.tagline,
    assignmentId: opts.assignmentId,
    stage: 'ASSIGN',
    stories: [
      {
        slug: slugify(watch.beatName).slice(0, 60) || 'the-beat',
        beatId: watch.beatId,
        beatName: watch.beatName,
        signals: [framing, ...watch.signals],
        reporterName: 'Ida Stringer',
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
