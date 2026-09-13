import RssParser from 'rss-parser';
import type { Signal } from '../core/signal.js';
import { makeSignalId, shortHash } from '../core/signal.js';
import { clampText, fetchText, filterUnseen, optNumber, requireString } from './helpers.js';
import type { FetchContext, SourceAdapter, SourceConfig } from './types.js';

/**
 * Reads any RSS or Atom feed. Covers most of the web. Emits one signal per new
 * item, deduped by a stable id built from the item's guid/link/title.
 *
 * Config:
 *   { id, type: 'rss', url: 'https://…/feed.xml', max?: number }
 */
const parser = new RssParser();

export const rssAdapter: SourceAdapter = {
  type: 'rss',
  displayName: 'RSS / Atom feed',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const url = requireString(source, 'url');
    const max = optNumber(source, 'max', 50);

    // Fetched through the shared reader rather than the parser's own, so the feed gets the
    // same scheme check and size cap as every other URL this program reads.
    const feed = await parser.parseString(await fetchText(url, 'rss', { timeoutMs: 15000 }));
    const items = (feed.items ?? []).slice(0, max);

    const candidates: Signal[] = items.map((item) => {
      const link = item.link ?? '';
      const key = item.guid ?? link ?? item.title ?? '';
      const hash = shortHash(key);
      const body = clampText(
        item.contentSnippet ?? stripHtml(item.content ?? '') ?? item.summary ?? '',
      );
      const ts = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : undefined);
      return {
        id: makeSignalId(source.id, hash),
        sourceId: source.id,
        sourceType: 'rss',
        timestamp: ts ?? ctx.now.toISOString(),
        title: (item.title ?? '(untitled)').trim(),
        body,
        url: link || undefined,
        hash,
        meta: {
          feedTitle: feed.title,
          author: item.creator ?? item.author,
          categories: item.categories,
        },
      };
    });

    return filterUnseen(ctx.state, candidates);
  },
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
