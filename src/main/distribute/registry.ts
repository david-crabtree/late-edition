import { rssChannel } from './channels/rss.js';
import { slackChannel } from './channels/slack.js';
import { teamsChannel } from './channels/teams.js';
import { webhookChannel } from './channels/webhook.js';
import type { Channel } from './types.js';

const channels = new Map<string, Channel>();

export function registerChannel(channel: Channel): void {
  channels.set(channel.type, channel);
}

export function getChannel(type: string): Channel | undefined {
  return channels.get(type);
}

export function listChannels(): Channel[] {
  return [...channels.values()];
}

registerChannel(slackChannel);
registerChannel(teamsChannel);
registerChannel(webhookChannel);
registerChannel(rssChannel);
