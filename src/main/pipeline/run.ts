import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../adapters/index.js'; // register built-in source adapters (side-effect import)
import { loadNewsroom } from '../config/newsroom.js';
import type { Edition } from '../core/edition.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import { nextEditionId, writeEdition } from '../store/edition-store.js';
import { EditionLog } from '../store/log.js';
import { paths } from '../store/paths.js';
import type { PipelineContext } from './context.js';
import { type EditionDraft, type Stage, nextStage } from './draft.js';
import {
  assembleEdition,
  stageAngles,
  stageAssign,
  stageCall,
  stageCheck,
  stageProof,
  stageReport,
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
    : newDraft(opts.root, newsroom.config.paper.name, newsroom.config.paper.tagline, now);

  const logFile = join(p.editionDir(draft.id), 'log.jsonl');
  const ctx: PipelineContext = {
    newsroom,
    root: opts.root,
    forceProvider: opts.forceProvider,
    reporterTimeoutMs: opts.reporterTimeoutMs ?? 120_000,
    editorTimeoutMs: opts.editorTimeoutMs ?? 120_000,
    writerTimeoutMs: opts.writerTimeoutMs ?? 120_000,
    concurrency: opts.concurrency ?? 3,
    urgencyThreshold: newsroom.config.edition?.urgencyThreshold ?? 0.85,
    log: new EditionLog(logFile),
    now,
  };

  const persist = () => saveDraft(opts.root, draft);
  persist();

  while (draft.stage !== 'DONE') {
    const stage = draft.stage;
    if (stage === 'PRESS') {
      const edition = assembleEdition(draft);
      const editionDir = writeEdition(opts.root, edition, {
        markdown: renderMarkdown(edition),
        html: renderHtml(edition),
      });
      draft.stage = 'DONE';
      persist();
      ctx.log.emit('PRESS', 'printed', { stories: edition.stories.length, dir: editionDir });
      return { edition, editionDir, editionId: draft.id, warnings: draft.warnings };
    }

    try {
      await STAGE_RUNNERS[stage](draft, ctx);
    } catch (err) {
      persist(); // keep the failed stage so `resume` can retry it
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
