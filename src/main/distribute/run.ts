import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DistributionConfig } from '../config/types.js';
import type { Edition } from '../core/edition.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import { paths } from '../store/paths.js';
import { getChannel } from './registry.js';
import type { DistributionResult } from './types.js';

export interface DistributeOptions {
  root: string;
  editionId: string;
  /** Distribution config (usually from the newsroom). */
  config: DistributionConfig;
  /** Preview what would be sent without actually sending. */
  dryRun?: boolean;
}

/**
 * Deliver an already-printed edition to every configured channel. Distribution is
 * opt-in (the caller decides when to invoke this) and each channel handles its own
 * failures, so one bad webhook can't block the rest.
 */
export async function distributeEdition(opts: DistributeOptions): Promise<DistributionResult[]> {
  const p = paths(opts.root);
  const editionDir = p.editionDir(opts.editionId);
  const edition = JSON.parse(readFileSync(join(editionDir, 'edition.json'), 'utf8')) as Edition;

  // Prefer the rendered files on disk; fall back to re-rendering.
  const markdown = readOr(join(editionDir, 'edition.md'), () => renderMarkdown(edition));
  const html = readOr(join(editionDir, 'edition.html'), () => renderHtml(edition));

  const ctx = {
    edition,
    markdown,
    html,
    editionDir,
    editionsDir: p.editionsDir,
    dryRun: opts.dryRun ?? false,
  };

  const results: DistributionResult[] = [];
  for (const channelConfig of opts.config.channels) {
    const channel = getChannel(channelConfig.type);
    if (!channel) {
      results.push({
        channel: channelConfig.type,
        ok: false,
        detail: `Unknown distribution channel "${channelConfig.type}".`,
      });
      continue;
    }
    results.push(await channel.send(ctx, channelConfig));
  }
  return results;
}

function readOr(file: string, fallback: () => string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return fallback();
  }
}
