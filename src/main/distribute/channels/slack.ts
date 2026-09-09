import type { DistChannelConfig } from '../../config/types.js';
import { textSummary } from '../summary.js';
import type { Channel, ChannelContext, DistributionResult } from '../types.js';
import { secretFromEnv } from '../types.js';

/**
 * Slack via an incoming webhook. Config:
 *   { type: 'slack', webhook_env: 'SLACK_WEBHOOK_URL' }
 * The webhook URL is read from the named env var so it never sits in yaml.
 */
export const slackChannel: Channel = {
  type: 'slack',
  displayName: 'Slack',
  async send(ctx: ChannelContext, config: DistChannelConfig): Promise<DistributionResult> {
    const url = secretFromEnv(config, 'webhook_env');
    if (!url) {
      return {
        channel: 'slack',
        ok: false,
        skipped: true,
        detail: 'Set a webhook URL in the env var named by `webhook_env` (e.g. SLACK_WEBHOOK_URL).',
      };
    }
    const text = textSummary(ctx.edition);
    if (ctx.dryRun) {
      return { channel: 'slack', ok: true, detail: `[dry-run] would POST to Slack:\n${text}` };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15000),
      });
      return res.ok
        ? { channel: 'slack', ok: true, detail: 'Posted to Slack.' }
        : { channel: 'slack', ok: false, detail: `Slack responded ${res.status}.` };
    } catch (err) {
      return {
        channel: 'slack',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
