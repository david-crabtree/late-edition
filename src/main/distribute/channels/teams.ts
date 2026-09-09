import type { DistChannelConfig } from '../../config/types.js';
import { headlines } from '../summary.js';
import type { Channel, ChannelContext, DistributionResult } from '../types.js';
import { secretFromEnv } from '../types.js';

/**
 * Microsoft Teams via an incoming webhook (legacy MessageCard payload). Config:
 *   { type: 'teams', webhook_env: 'TEAMS_WEBHOOK_URL' }
 */
export const teamsChannel: Channel = {
  type: 'teams',
  displayName: 'Microsoft Teams',
  async send(ctx: ChannelContext, config: DistChannelConfig): Promise<DistributionResult> {
    const url = secretFromEnv(config, 'webhook_env');
    if (!url) {
      return {
        channel: 'teams',
        ok: false,
        skipped: true,
        detail: 'Set a webhook URL in the env var named by `webhook_env` (e.g. TEAMS_WEBHOOK_URL).',
      };
    }
    const ed = ctx.edition;
    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `${ed.paperName} No. ${ed.number}`,
      themeColor: '7a2d1d',
      title: `${ed.paperName} — No. ${ed.number}`,
      text: ed.weatherLine ?? '',
      sections: [{ facts: headlines(ed).map((h, i) => ({ name: `#${i + 1}`, value: h })) }],
    };
    if (ctx.dryRun) {
      return {
        channel: 'teams',
        ok: true,
        detail: `[dry-run] would POST MessageCard with ${headlines(ed).length} headline(s).`,
      };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(card),
        signal: AbortSignal.timeout(15000),
      });
      return res.ok
        ? { channel: 'teams', ok: true, detail: 'Posted to Teams.' }
        : { channel: 'teams', ok: false, detail: `Teams responded ${res.status}.` };
    } catch (err) {
      return {
        channel: 'teams',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
