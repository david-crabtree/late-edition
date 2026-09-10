import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import type { LogEvent } from '../store/log.js';
import { runEdition } from './run.js';

describe('live event streaming (what the desktop UI subscribes to)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-stream-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('calls onEvent for every pipeline event as it happens', async () => {
    const events: LogEvent[] = [];
    await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'The state of open-source AI newsroom tools in 2026',
      onEvent: (ev) => events.push(ev),
      now: new Date('2026-09-10T12:00:00Z'),
    });

    // The stream carries the whole run, in order, keyed by stage — enough for a UI to animate.
    const stages = events.map((e) => e.stage);
    expect(stages).toContain('TRIAGE');
    expect(stages).toContain('RESEARCH');
    expect(stages).toContain('researcher');
    expect(stages).toContain('REPORT');
    expect(stages).toContain('PRESS');
    // Each event has a timestamp and an event type.
    expect(events.every((e) => typeof e.ts === 'string' && typeof e.event === 'string')).toBe(true);
    // PRESS 'printed' should be near the end.
    expect(events.some((e) => e.stage === 'PRESS' && e.event === 'printed')).toBe(true);
  });
});
