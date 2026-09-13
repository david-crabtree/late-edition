import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DistChannelConfig } from '../../config/types.js';
import type { Edition } from '../../core/edition.js';
import type { Channel, ChannelContext, DistributionResult } from '../types.js';

/**
 * Writes/refreshes an RSS 2.0 feed (`editions/feed.xml`) covering recent editions, so a
 * team can subscribe with any reader — no app required. Config:
 *   { type: 'rss', base_url?: 'https://paper.example/editions', max?: 20 }
 * With `base_url`, item links point at the hosted HTML; without it, at the local file.
 */
export const rssChannel: Channel = {
  type: 'rss',
  displayName: 'RSS feed (out)',
  async send(ctx: ChannelContext, config: DistChannelConfig): Promise<DistributionResult> {
    const baseUrl =
      typeof config.base_url === 'string' ? config.base_url.replace(/\/$/, '') : undefined;
    const max = typeof config.max === 'number' ? config.max : 20;

    const editions = loadRecentEditions(ctx.editionsDir, max);
    // Ensure the just-printed edition is included even if it isn't on disk yet.
    if (!editions.find((e) => e.id === ctx.edition.id)) editions.unshift(ctx.edition);

    const xml = buildFeed(ctx.edition.paperName, editions, baseUrl, ctx.editionsDir);
    const out = join(ctx.editionsDir, 'feed.xml');
    if (ctx.dryRun) {
      return {
        channel: 'rss',
        ok: true,
        detail: `[dry-run] would write ${editions.length} item(s) to ${out}.`,
      };
    }
    try {
      writeFileSync(out, xml, 'utf8');
      return {
        channel: 'rss',
        ok: true,
        detail: `Wrote feed with ${editions.length} item(s) → ${out}`,
      };
    } catch (err) {
      return {
        channel: 'rss',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

function loadRecentEditions(editionsDir: string, max: number): Edition[] {
  let dirs: string[] = [];
  try {
    dirs = readdirSync(editionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
  const editions: Edition[] = [];
  for (const d of dirs.slice(0, max)) {
    try {
      editions.push(
        JSON.parse(readFileSync(join(editionsDir, d, 'edition.json'), 'utf8')) as Edition,
      );
    } catch {
      // skip editions without a readable edition.json
    }
  }
  return editions;
}

function buildFeed(
  paperName: string,
  editions: Edition[],
  baseUrl: string | undefined,
  editionsDir: string,
): string {
  const items = editions
    .map((ed) => {
      // Without a base_url there is no address anyone else can open, and a file:// path
      // would carry the user's folder layout (usually their name) into a feed meant to be
      // sent on. The guid still identifies the edition; the link is simply left out.
      const link = baseUrl ? `${baseUrl}/${ed.id}/edition.html` : undefined;
      const desc = [ed.weatherLine, ...ed.stories.map((s) => `• ${s.headline}`)]
        .filter(Boolean)
        .join('\n');
      return `    <item>
      <title>${xml(`${paperName} — No. ${ed.number}`)}</title>
${
  link
    ? `      <link>${xml(link)}</link>
`
    : ''
}      <guid isPermaLink="false">${xml(ed.id)}</guid>
      <pubDate>${new Date(ed.generatedAt).toUTCString()}</pubDate>
      <description>${xml(desc)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(paperName)}</title>
    <description>${xml(`${paperName} — daily edition`)}</description>
    <link>${xml(baseUrl ?? 'about:blank')}</link>
${items}
  </channel>
</rss>
`;
}

function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
