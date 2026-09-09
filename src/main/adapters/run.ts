import type { Signal } from '../core/signal.js';
import { FileAdapterState } from '../store/state.js';
import { getAdapter } from './registry.js';
import type { SourceConfig } from './types.js';

export interface SourceRunResult {
  sourceId: string;
  type: string;
  signals: Signal[];
  error?: string;
}

/**
 * Run one configured source through its adapter, persisting the adapter's "seen"
 * state. Never throws: adapter failures are captured on the result so one broken
 * source can't sink the whole edition.
 */
export async function runSource(
  source: SourceConfig,
  stateDir: string,
  now: Date,
): Promise<SourceRunResult> {
  const adapter = getAdapter(source.type);
  if (!adapter) {
    return {
      sourceId: source.id,
      type: source.type,
      signals: [],
      error: `Unknown source type "${source.type}". Known types are registered in adapters/index.ts.`,
    };
  }
  const state = FileAdapterState.load(stateDir, source.id);
  try {
    const signals = await adapter.fetch(source, { state, now });
    state.flush();
    return { sourceId: source.id, type: source.type, signals };
  } catch (err) {
    // Don't persist partial state on failure.
    return {
      sourceId: source.id,
      type: source.type,
      signals: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
