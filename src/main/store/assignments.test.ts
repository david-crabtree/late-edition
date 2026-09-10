import { describe, expect, it } from 'vitest';
import type { Assignment } from '../config/types.js';
import { type AssignmentState, isDue, parseCadenceMs } from './assignments.js';

const A = (cadence: string): Assignment => ({ id: 'a', title: 'A', brief: 'b', cadence });

describe('parseCadenceMs', () => {
  it('treats manual/blank/garbage as never-auto (null)', () => {
    expect(parseCadenceMs('manual')).toBeNull();
    expect(parseCadenceMs('')).toBeNull();
    expect(parseCadenceMs(undefined)).toBeNull();
    expect(parseCadenceMs('whenever')).toBeNull();
  });
  it('parses durations and words', () => {
    expect(parseCadenceMs('30m')).toBe(30 * 60_000);
    expect(parseCadenceMs('6h')).toBe(6 * 3_600_000);
    expect(parseCadenceMs('1d')).toBe(86_400_000);
    expect(parseCadenceMs('2w')).toBe(2 * 604_800_000);
    expect(parseCadenceMs('daily')).toBe(86_400_000);
  });
});

describe('isDue', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  it('is never due for a manual assignment', () => {
    expect(isDue(A('manual'), { runs: 0 }, now)).toBe(false);
  });
  it('is due when it has never run', () => {
    expect(isDue(A('1d'), { runs: 0 }, now)).toBe(true);
  });
  it('is not due until the interval has elapsed', () => {
    const twoHoursAgo: AssignmentState = {
      runs: 1,
      lastRunAt: new Date(now.getTime() - 2 * 3_600_000).toISOString(),
    };
    expect(isDue(A('1d'), twoHoursAgo, now)).toBe(false);
    expect(isDue(A('1h'), twoHoursAgo, now)).toBe(true);
  });
});
