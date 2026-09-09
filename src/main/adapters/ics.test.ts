import { describe, expect, it } from 'vitest';
import { icsAdapter } from './ics.js';
import type { AdapterState, FetchContext } from './types.js';

class MemState implements AdapterState {
  private m = new Map<string, unknown>();
  get<T>(k: string) {
    return this.m.get(k) as T | undefined;
  }
  set(k: string, v: unknown) {
    this.m.set(k, v);
  }
  delete(k: string) {
    this.m.delete(k);
  }
}

const CAL = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1@example.com
SUMMARY:Release planning
DTSTART:20260910T130000Z
LOCATION:War Room
DESCRIPTION:Plan the next\\nrelease
END:VEVENT
BEGIN:VEVENT
UID:evt-old@example.com
SUMMARY:Ancient standup
DTSTART:20200101T090000Z
END:VEVENT
END:VCALENDAR`;

function ctx(): FetchContext {
  return { state: new MemState(), now: new Date('2026-09-09T00:00:00Z') };
}

describe('icsAdapter', () => {
  it('parses upcoming events, unfolding and unescaping, and skips past ones', async () => {
    // Write the calendar to a temp file and read via `path`.
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'le-ics-'));
    const file = join(dir, 'cal.ics');
    writeFileSync(file, CAL);
    try {
      const signals = await icsAdapter.fetch({ id: 'cal', type: 'ics', path: file }, ctx());
      expect(signals).toHaveLength(1); // the 2020 event is filtered out as past
      expect(signals[0]?.title).toBe('Release planning');
      expect(signals[0]?.body).toContain('War Room');
      expect(signals[0]?.body).toContain('Plan the next\nrelease');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when neither url nor path is set', async () => {
    await expect(icsAdapter.fetch({ id: 'cal', type: 'ics' }, ctx())).rejects.toThrow(
      /needs a `url` or a `path`/,
    );
  });
});
