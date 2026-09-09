import type { Signal } from '../core/signal.js';
import type { AdapterState, SourceConfig } from './types.js';

/** Read a required string option from a source config, or throw a clear error. */
export function requireString(source: SourceConfig, key: string): string {
  const v = source[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Source "${source.id}" (${source.type}) requires a \`${key}\` string.`);
  }
  return v;
}

/** Read an optional string option. */
export function optString(source: SourceConfig, key: string): string | undefined {
  const v = source[key];
  return typeof v === 'string' ? v : undefined;
}

/** Read an optional number option. */
export function optNumber(source: SourceConfig, key: string, fallback: number): number {
  const v = source[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Filter candidate signals down to those not seen on a previous run, and record the
 * newly-seen ids in state. A bounded ring of recent ids is kept to cap state size.
 */
export function filterUnseen(
  state: AdapterState,
  signals: Signal[],
  opts: { key?: string; keep?: number } = {},
): Signal[] {
  const key = opts.key ?? 'seenIds';
  const keep = opts.keep ?? 500;
  const prior = new Set(state.get<string[]>(key) ?? []);
  const fresh = signals.filter((s) => !prior.has(s.id));
  if (fresh.length === 0) return [];
  // Newest kept at the end; trim from the front when over budget.
  const merged = [...prior, ...fresh.map((s) => s.id)];
  const trimmed = merged.slice(Math.max(0, merged.length - keep));
  state.set(key, trimmed);
  return fresh;
}

/** Clamp plain text to a sane length for a signal body. */
export function clampText(text: string, max = 4000): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
