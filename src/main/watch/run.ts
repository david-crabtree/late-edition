import { join } from 'node:path';
import '../adapters/index.js'; // register built-in source adapters
import { runSource } from '../adapters/run.js';
import { loadNewsroom } from '../config/newsroom.js';
import type { Signal } from '../core/signal.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import type { PipelineContext } from '../pipeline/context.js';
import { type EditionDraft, slugify } from '../pipeline/draft.js';
import {
  assembleEdition,
  stageAngles,
  stageAssign,
  stageCall,
  stageCheck,
  stageReport,
  stageWrite,
} from '../pipeline/stages.js';
import { nextExtraId, writeEdition } from '../store/edition-store.js';
import { EditionLog } from '../store/log.js';
import { paths } from '../store/paths.js';
import { appendToWire } from '../store/wire.js';
import { beatHits } from './tripwire.js';

export interface WatchOptions {
  root: string;
  forceProvider?: string;
  now?: Date;
  reporterTimeoutMs?: number;
  editorTimeoutMs?: number;
  writerTimeoutMs?: number;
  concurrency?: number;
}

export interface WatchResult {
  /** Total new signals polled across all sources. */
  polled: number;
  /** Total signals that tripped a tripwire. */
  hits: number;
  /** The Late Extra produced this poll, if any. */
  extra?: { id: string; dir: string; stories: number };
}

/**
 * Poll every source once and, when a signal trips a beat's tripwire, fire a single
 * Late Extra bulletin — a one-off edition outside the daily cycle. Watchers keep their
 * own "seen" state so they never consume signals the daily edition would report.
 */
export async function runWatchOnce(opts: WatchOptions): Promise<WatchResult> {
  const newsroom = await loadNewsroom(opts.root);
  const now = opts.now ?? new Date();
  const p = paths(opts.root);
  const watchStateDir = join(p.wireDir, '.watch-state');

  let polled = 0;
  const hitStories: EditionDraft['stories'] = [];
  let totalHits = 0;

  for (const beat of newsroom.beats) {
    if (!beat.tripwires || beat.tripwires.length === 0) continue;
    const signals: Signal[] = [];
    for (const source of beat.sources) {
      const result = await runSource(source, watchStateDir, now);
      polled += result.signals.length;
      if (!result.error) signals.push(...result.signals);
    }
    const hits = beatHits(beat, signals);
    if (hits.length === 0) continue;
    totalHits += hits.length;
    hitStories.push({
      slug: slugify(beat.id),
      beatId: beat.id,
      beatName: beat.name,
      signals: hits.map((h) => h.signal),
      reporterName: beat.reporter ?? `The ${beat.name} Desk`,
      reporterProviderId: '',
      reports: [],
    });
  }

  if (hitStories.length === 0) return { polled, hits: 0 };

  const date = now.toISOString().slice(0, 10);
  const { id, number } = nextExtraId(opts.root, date);
  const draft: EditionDraft = {
    id,
    number,
    date,
    paperName: newsroom.config.paper.name,
    tagline: newsroom.config.paper.tagline,
    stage: 'ASSIGN',
    lateExtra: true,
    stories: hitStories,
    briefs: [],
    editorsLog: [],
    tokenUsage: [],
    warnings: [],
  };

  const ctx: PipelineContext = {
    newsroom,
    root: opts.root,
    forceProvider: opts.forceProvider,
    reporterTimeoutMs: opts.reporterTimeoutMs ?? 120_000,
    editorTimeoutMs: opts.editorTimeoutMs ?? 120_000,
    writerTimeoutMs: opts.writerTimeoutMs ?? 120_000,
    concurrency: opts.concurrency ?? 3,
    urgencyThreshold: newsroom.config.edition?.urgencyThreshold ?? 0.85,
    log: new EditionLog(join(p.editionDir(id), 'log.jsonl')),
    now,
  };

  ctx.log.emit('EXTRA', 'tripwire', { hits: totalHits, stories: hitStories.length });
  appendToWire(
    opts.root,
    hitStories.flatMap((s) => s.signals),
  );

  await stageAssign(draft, ctx);
  await stageReport(draft, ctx);
  await stageAngles(draft, ctx);
  await stageCall(draft, ctx);
  await stageWrite(draft, ctx);
  await stageCheck(draft, ctx);

  const edition = assembleEdition(draft);
  const dir = writeEdition(opts.root, edition, {
    markdown: renderMarkdown(edition),
    html: renderHtml(edition),
  });
  ctx.log.emit('EXTRA', 'printed', { id, stories: edition.stories.length });

  return { polled, hits: totalHits, extra: { id, dir, stories: edition.stories.length } };
}
