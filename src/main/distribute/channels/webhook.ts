import type { DistChannelConfig } from '../../config/types.js';
import { textSummary } from '../summary.js';
import type { Channel, ChannelContext, DistributionResult } from '../types.js';
import { secretFromEnv } from '../types.js';

/**
 * A generic JSON webhook — for anything that isn't Slack/Teams (a custom bot, Zapier,
 * an internal endpoint). Posts the edition metadata plus a text summary. Config:
 *   { type: 'webhook', url_env: 'LATE_EDITION_WEBHOOK_URL' }
 */
export const webhookChannel: Channel = {
  type: 'webhook',
  displayName: 'Generic webhook',
  async send(ctx: ChannelContext, config: DistChannelConfig): Promise<DistributionResult> {
    const url = secretFromEnv(config, 'url_env');
    if (!url) {
      return {
        channel: 'webhook',
        ok: false,
        skipped: true,
        detail: 'Set the target URL in the env var named by `url_env`.',
      };
    }
    const ed = ctx.edition;
    const payload = {
      paperName: ed.paperName,
      number: ed.number,
      date: ed.date,
      weatherLine: ed.weatherLine,
      summary: textSummary(ed),
      stories: ed.stories.map((s) => ({ headline: s.headline, placement: s.placement })),
    };
    if (ctx.dryRun) {
      return {
        channel: 'webhook',
        ok: true,
        detail: `[dry-run] would POST JSON to ${hostOf(url)}.`,
      };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      return res.ok
        ? { channel: 'webhook', ok: true, detail: `Posted to ${hostOf(url)}.` }
        : { channel: 'webhook', ok: false, detail: `Webhook responded ${res.status}.` };
    } catch (err) {
      return {
        channel: 'webhook',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/**
 * Only the host is ever printed. A webhook URL usually carries its secret in the path, and
 * a run's output ends up in logs, terminals and bug reports.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(webhook)';
  }
}
