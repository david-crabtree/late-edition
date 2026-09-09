import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Edition } from '../core/edition.js';
import { rssChannel } from './channels/rss.js';
import { slackChannel } from './channels/slack.js';
import { distributeEdition } from './run.js';
import type { ChannelContext } from './types.js';

function edition(id: string, number: number): Edition {
  return {
    id,
    number,
    date: '2026-09-09',
    paperName: 'The Daily Bit',
    weatherLine: 'Ink is cheap; the truth less so.',
    stories: [
      {
        slug: 's1',
        beatId: 'b',
        beatName: 'B',
        headline: 'Something Happened',
        standfirst: 'A deck.',
        body: 'Body [b:aabbccddeeff].',
        byline: 'Sam Vance',
        placement: 'page_one',
        chosenAngle: 'straight',
        rationale: '',
        sources: [{ signalId: 'b:aabbccddeeff', title: 'sig' }],
        reports: [],
      },
    ],
    briefs: [],
    editorsLog: [],
    corrections: [],
    tokenUsage: [],
    generatedAt: '2026-09-09T12:00:00.000Z',
  };
}

let dir: string;

function ctx(dryRun: boolean): ChannelContext {
  return {
    edition: edition('2026-09-09-001', 1),
    markdown: '# md',
    html: '<html></html>',
    editionDir: join(dir, 'editions', '2026-09-09-001'),
    editionsDir: join(dir, 'editions'),
    dryRun,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-dist-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.SLACK_WEBHOOK_URL;
});

describe('slack channel', () => {
  it('is skipped (not failed) when the webhook env var is unset', async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const r = await slackChannel.send(ctx(true), {
      type: 'slack',
      webhook_env: 'SLACK_WEBHOOK_URL',
    });
    expect(r.skipped).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('previews without sending on dry-run', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.example/x';
    const r = await slackChannel.send(ctx(true), {
      type: 'slack',
      webhook_env: 'SLACK_WEBHOOK_URL',
    });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('[dry-run]');
    expect(r.detail).toContain('The Daily Bit');
  });
});

describe('rss channel', () => {
  it('writes a valid feed listing editions on disk', async () => {
    const editionsDir = join(dir, 'editions');
    for (const [id, n] of [
      ['2026-09-09-001', 1],
      ['2026-09-09-002', 2],
    ] as const) {
      mkdirSync(join(editionsDir, id), { recursive: true });
      writeFileSync(join(editionsDir, id, 'edition.json'), JSON.stringify(edition(id, n)));
    }
    const r = await rssChannel.send(
      { ...ctx(false), edition: edition('2026-09-09-002', 2) },
      { type: 'rss', base_url: 'https://paper.example/e' },
    );
    expect(r.ok).toBe(true);
    const feed = readFileSync(join(editionsDir, 'feed.xml'), 'utf8');
    expect(feed).toContain('<rss version="2.0">');
    expect(feed).toContain('2026-09-09-002');
    expect(feed).toContain('https://paper.example/e/2026-09-09-002/edition.html');
  });

  it('does not write on dry-run', async () => {
    mkdirSync(join(dir, 'editions'), { recursive: true });
    const r = await rssChannel.send(ctx(true), { type: 'rss' });
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, 'editions', 'feed.xml'))).toBe(false);
  });
});

describe('distributeEdition', () => {
  it('runs each configured channel and reports unknown ones', async () => {
    const editionsDir = join(dir, 'editions', '2026-09-09-001');
    mkdirSync(editionsDir, { recursive: true });
    writeFileSync(join(editionsDir, 'edition.json'), JSON.stringify(edition('2026-09-09-001', 1)));
    const results = await distributeEdition({
      root: dir,
      editionId: '2026-09-09-001',
      dryRun: true,
      config: { autoSend: false, channels: [{ type: 'rss' }, { type: 'nonsense' }] },
    });
    expect(results.find((r) => r.channel === 'rss')?.ok).toBe(true);
    expect(results.find((r) => r.channel === 'nonsense')?.ok).toBe(false);
  });
});
