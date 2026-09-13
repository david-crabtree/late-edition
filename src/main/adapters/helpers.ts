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

/** The most an adapter will read from one URL. Pages and feeds bigger than this are not
 *  news; they are a mistake or an attack, and either way not worth the memory. */
export const MAX_FETCH_BYTES = 8 * 1024 * 1024;

/**
 * A URL an adapter is allowed to read: http or https, and nothing else. A `file:` or
 * `javascript:` value is refused whoever wrote it.
 *
 * Whether a private address is allowed depends on who chose the URL. A source the user
 * typed into config may well be an intranet wiki or a page on their own machine, and that
 * is their business. A URL the field desk picked up out of somebody else's feed or page is
 * different: a hostile source that points the newsroom at `localhost:11434` would have it
 * reading whatever local service happens to answer, so those are refused unless
 * `LATE_EDITION_ALLOW_LOCAL_URLS=1` is set.
 */
export function assertFetchableUrl(
  url: string,
  who: string,
  opts: { allowPrivate?: boolean } = {},
): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`${who}: not a URL: ${url}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${who}: only http and https URLs can be read, not ${u.protocol}`);
  }
  if (opts.allowPrivate || process.env.LATE_EDITION_ALLOW_LOCAL_URLS === '1') return u;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const local =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^fe[89ab][0-9a-f]:/i.test(host);
  if (local) throw new Error(`${who}: refusing to read a local or private address (${host}).`);
  return u;
}

/**
 * Fetch a URL as text with the checks above, a timeout, and a hard cap on the body.
 * The cap is enforced on the bytes actually read, not on Content-Length, which a server
 * can omit or lie about.
 */
export async function fetchText(
  url: string,
  who: string,
  opts: { timeoutMs?: number; maxBytes?: number; allowPrivate?: boolean } = {},
): Promise<string> {
  // Adapters read what the user configured, so a private address is allowed here. The
  // field desk applies the stricter check at the moment it adopts a URL it did not choose.
  assertFetchableUrl(url, who, { allowPrivate: opts.allowPrivate ?? true });
  const max = opts.maxBytes ?? MAX_FETCH_BYTES;
  const res = await fetch(url, {
    headers: { 'user-agent': `late-edition/0.0 (+${who})` },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${who}: ${url} responded ${res.status}.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > max) throw new Error(`${who}: ${url} is ${declared} bytes; the limit is ${max}.`);
  if (!res.body) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new Error(`${who}: ${url} exceeded the ${max}-byte limit.`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

/** Clamp plain text to a sane length for a signal body. */
export function clampText(text: string, max = 4000): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
