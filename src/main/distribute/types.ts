import type { DistChannelConfig } from '../config/types.js';
import type { Edition } from '../core/edition.js';

/** Everything a channel needs to deliver one edition. */
export interface ChannelContext {
  edition: Edition;
  markdown: string;
  html: string;
  /** Absolute path to the edition directory on disk. */
  editionDir: string;
  /** Absolute path to the editions root (for feeds spanning editions). */
  editionsDir: string;
  /** When true, do everything except actually send — return what *would* be sent. */
  dryRun: boolean;
}

export interface DistributionResult {
  channel: string;
  ok: boolean;
  /** Human-readable outcome, or a preview when dryRun. */
  detail: string;
  /** True when the channel was not configured and was skipped. */
  skipped?: boolean;
}

/** An outbound distribution channel (Slack, Teams, a webhook, an RSS feed, …). */
export interface Channel {
  /** The `type` string that selects this channel in config. */
  readonly type: string;
  readonly displayName: string;
  /** Deliver the edition. Must never throw; return a result with ok:false instead. */
  send(ctx: ChannelContext, config: DistChannelConfig): Promise<DistributionResult>;
}

/** Read a secret (webhook URL, etc.) from the env var named by `<key>` in config. */
export function secretFromEnv(config: DistChannelConfig, key: string): string | undefined {
  const envName = config[key];
  if (typeof envName !== 'string' || envName === '') return undefined;
  return process.env[envName];
}
