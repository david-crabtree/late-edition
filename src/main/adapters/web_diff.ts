import { load } from 'cheerio';
import { diffLines } from 'diff';
import type { Signal } from '../core/signal.js';
import { makeSignalId, shortHash } from '../core/signal.js';
import { clampText, fetchText, optString, requireString } from './helpers.js';
import type { FetchContext, SourceAdapter, SourceConfig } from './types.js';

/**
 * Fetches a URL, extracts readable text, and diffs it against the last snapshot.
 * Emits a signal only when the page changed, with the newly-added lines as the
 * body. Good for pricing pages, changelogs, status pages. Read-only (GET only).
 *
 * Config:
 *   { id, type: 'web_diff', url: 'https://…', selector?: string }
 * `selector` optionally narrows extraction to a CSS selector (e.g. 'main', '.pricing').
 */
export const webDiffAdapter: SourceAdapter = {
  type: 'web_diff',
  displayName: 'Web page diff',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const url = requireString(source, 'url');
    const selector = optString(source, 'selector');

    const html = await fetchText(url, 'web_diff');
    const text = extractText(html, selector);
    const hash = shortHash(text);

    const priorHash = ctx.state.get<string>('snapshotHash');
    const priorText = ctx.state.get<string>('snapshotText') ?? '';
    ctx.state.set('snapshotHash', hash);
    ctx.state.set('snapshotText', text);

    if (priorHash === undefined) {
      // First sighting: record the baseline, emit nothing (no change to report yet).
      return [];
    }
    if (priorHash === hash) return [];

    const added = diffLines(priorText, text)
      .filter((part) => part.added)
      .map((part) => part.value.trim())
      .filter(Boolean)
      .join('\n');

    const body = clampText(
      added || 'The page changed (no net text added — content was removed or reordered).',
    );
    return [
      {
        id: makeSignalId(source.id, hash),
        sourceId: source.id,
        sourceType: 'web_diff',
        timestamp: ctx.now.toISOString(),
        title: `Changed: ${titleOf(html) ?? url}`,
        body,
        url,
        hash,
        meta: { addedLines: added ? added.split('\n').length : 0 },
      },
    ];
  },
};

function extractText(html: string, selector?: string): string {
  const $ = load(html);
  $('script, style, noscript, svg, template').remove();
  const root = selector ? $(selector) : $('body');
  const text = (root.length ? root : $.root()).text();
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function titleOf(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.trim() || undefined;
}
