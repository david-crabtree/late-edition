import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Signal } from '../core/signal.js';
import type { CopyCheck, EditorCall, FiledReport } from '../pipeline/contracts.js';
import { fakeProvider } from './fake.js';
import { runToText } from './types.js';
import type { AgentJob, AgentRole } from './types.js';

const signals: Signal[] = [
  {
    id: 'feed-1:aaaaaaaaaaaa',
    sourceId: 'feed-1',
    sourceType: 'rss',
    timestamp: '2026-09-09T10:00:00Z',
    title: 'widget factory ships version two',
    body: 'The long-awaited rewrite landed overnight after months of work.',
    url: 'https://example.com/v2',
    hash: 'aaaaaaaaaaaa',
  },
  {
    id: 'feed-1:bbbbbbbbbbbb',
    sourceId: 'feed-1',
    sourceType: 'rss',
    timestamp: '2026-09-09T09:00:00Z',
    title: 'minor dependency bump',
    body: 'Bumped left-pad from 1.0 to 1.1.',
    hash: 'bbbbbbbbbbbb',
  },
];

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-fake-'));
  writeFileSync(join(dir, 'signals.json'), JSON.stringify(signals), 'utf8');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function job(role: AgentRole): AgentJob {
  return {
    role,
    systemPrompt: 'you are a test',
    userPrompt: 'do the thing',
    workingDir: dir,
    timeoutMs: 1000,
  };
}

describe('fakeProvider', () => {
  it('detects as always available', async () => {
    const d = await fakeProvider.detect();
    expect(d.installed).toBe(true);
    expect(d.authenticated).toBe(true);
  });

  it('reporter output parses as a FiledReport citing real signal ids', async () => {
    const { output } = await runToText(fakeProvider, job('reporter'));
    const report = JSON.parse(output) as FiledReport;
    expect(report.facts.length).toBeGreaterThan(0);
    const citedIds = new Set(report.facts.map((f) => f.signalId));
    expect(citedIds.has('feed-1:aaaaaaaaaaaa')).toBe(true);
    expect(report.confidence).toBeGreaterThan(0);
  });

  it('editor output parses as an EditorCall leading with the freshest signal', async () => {
    const { output } = await runToText(fakeProvider, job('editor'));
    const call = JSON.parse(output) as EditorCall;
    expect(call.placement).toBe('page_one');
    expect(call.headline.toLowerCase()).toContain('widget');
  });

  it('copydesk output parses as a passing CopyCheck', async () => {
    const { output } = await runToText(fakeProvider, job('copydesk'));
    const check = JSON.parse(output) as CopyCheck;
    expect(check.pass).toBe(true);
    expect(check.verifiedClaims.every((c) => c.supported)).toBe(true);
  });

  it('writer output is prose that cites a source id', async () => {
    const { output } = await runToText(fakeProvider, job('writer'));
    expect(output).toContain('feed-1:aaaaaaaaaaaa');
  });

  it('emits usage and reports token counts', async () => {
    const { usage } = await runToText(fakeProvider, job('reporter'));
    expect(usage?.outputTokens).toBeGreaterThan(0);
  });

  it('degrades gracefully with no materials', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'le-fake-empty-'));
    try {
      const { output } = await runToText(fakeProvider, {
        ...job('reporter'),
        workingDir: empty,
      });
      const report = JSON.parse(output) as FiledReport;
      expect(report.facts).toHaveLength(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
