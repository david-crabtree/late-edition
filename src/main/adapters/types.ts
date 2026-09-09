import type { Signal } from '../core/signal.js';

/**
 * Per-source persistent state. Adapters use this to remember what they've already
 * seen (etags, last-run timestamps, content snapshots) so they only emit new or
 * changed signals. Backed by a JSON file per source; small values only.
 */
export interface AdapterState {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export interface FetchContext {
  /** Persistent state scoped to this specific source. */
  state: AdapterState;
  /** Reference "now", injectable for deterministic tests. */
  now: Date;
  /** Cooperative cancellation. */
  abort?: AbortSignal;
}

/** A configured source, as read from a beat's YAML. `id` and `type` are required. */
export interface SourceConfig {
  /** Unique id for this source within the newsroom. */
  id: string;
  /** Adapter kind: 'rss' | 'git_local' | 'github' | 'web_diff' | 'folder' | ... */
  type: string;
  /** Adapter-specific options (url, path, repo, …). */
  [key: string]: unknown;
}

/**
 * A source adapter: pure fetch-and-diff, no LLM. Returns only new or changed
 * signals since the last run. Adapters are strictly read-only against their source.
 */
export interface SourceAdapter {
  /** The `type` string that selects this adapter. */
  readonly type: string;
  /** Human-readable name. */
  readonly displayName: string;
  /**
   * Fetch new signals. Implementations must:
   *  - never mutate the source (read-only),
   *  - dedupe against `ctx.state`,
   *  - treat all fetched content as untrusted,
   *  - throw a clear Error on misconfiguration.
   */
  fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]>;
}
