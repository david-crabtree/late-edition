import type { Newsroom } from '../config/types.js';
import type { EditionLog } from '../store/log.js';

/** Shared context handed to every pipeline stage. */
export interface PipelineContext {
  newsroom: Newsroom;
  /** Newsroom root on disk (dir containing `newsroom/`). */
  root: string;
  /** When set, forces this provider for every role (e.g. `fake`). */
  forceProvider?: string;
  /** Override researcher passes for every story (0 disables). Undefined = per-beat/brief default. */
  research?: number;
  /** When true (default), the Chief may pause a vague brief to ask the user for clarification. */
  clarify: boolean;
  researcherTimeoutMs: number;
  reporterTimeoutMs: number;
  editorTimeoutMs: number;
  writerTimeoutMs: number;
  /** Max agent jobs to run in parallel. */
  concurrency: number;
  /** Default urgency (0-1) at which a corroborated story stops the press. */
  urgencyThreshold: number;
  /** Hard cap on total tokens for one edition; work is curtailed once it's hit. Undefined = no cap. */
  tokenCap?: number;
  log: EditionLog;
  now: Date;
}

/** Run `fn` over `items` with at most `limit` in flight at once, preserving order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}
