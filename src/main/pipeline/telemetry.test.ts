import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import type { LogEvent } from '../store/log.js';
import { runEdition } from './run.js';
import { splitForConsole } from './stages.js';

/**
 * The app could only learn what a run cost once the whole edition came back, and it never
 * saw a word an agent wrote. Both of those are live events now, so both are worth pinning.
 */
describe('a run reports its spend and its working output as it happens', () => {
  let root: string;
  let events: LogEvent[];
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-telemetry-'));
    scaffoldNewsroom(root);
    events = [];
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = () =>
    runEdition({
      root,
      forceProvider: 'fake',
      brief: 'the price of tea',
      research: 0,
      onEvent: (ev) => events.push(ev),
    });

  it('announces spend per desk, with a running total, before the run finishes', async () => {
    const res = await run();
    const spend = events.filter((e) => e.stage === 'usage' && e.event === 'spent');
    expect(spend.length).toBeGreaterThan(1);
    // Each carries the desk that spent it and the total so far...
    for (const s of spend) {
      expect(typeof s.role).toBe('string');
      expect(typeof s.tokens).toBe('number');
    }
    // ...the total only ever climbs...
    const totals = spend.map((s) => s.total as number);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    // ...and it lands on the same figure the finished edition reports.
    const final = res.edition.tokenUsage.reduce(
      (n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
      0,
    );
    expect(totals.at(-1)).toBe(final);
  });

  it('streams each desk’s working output, attributed to that desk', async () => {
    await run();
    const chatter = events.filter((e) => e.event === 'chatter');
    expect(chatter.length).toBeGreaterThan(0);
    expect(new Set(chatter.map((c) => c.stage)).size).toBeGreaterThan(1);
    for (const c of chatter) expect(String(c.text).length).toBeGreaterThan(0);
  });

  it('breaks a block of output into console-sized lines at natural boundaries', () => {
    const lines = splitForConsole('One sentence. Two sentence.\n\nA new paragraph entirely.', 30);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(30);
    expect(lines.join(' ')).toContain('A new paragraph entirely.');
  });

  it('does not let one chatty desk flood the log', () => {
    const long = 'x'.repeat(500);
    expect(splitForConsole(long, 100)).toHaveLength(5);
  });
});
