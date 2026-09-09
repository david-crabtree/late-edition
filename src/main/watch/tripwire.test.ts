import { describe, expect, it } from 'vitest';
import type { BeatConfig } from '../config/types.js';
import type { Signal } from '../core/signal.js';
import { beatHits, signalTrips } from './tripwire.js';

function sig(id: string, title: string, body = '', sourceId = 'src'): Signal {
  return { id, sourceId, sourceType: 'folder', timestamp: '', title, body, hash: id };
}

describe('signalTrips', () => {
  it('matches a case-insensitive keyword', () => {
    expect(signalTrips(sig('a', 'Big SECURITY hole'), { match: 'security' })).toBe(true);
    expect(signalTrips(sig('a', 'nothing to see'), { match: 'security' })).toBe(false);
  });

  it('matches a regex when regex:true', () => {
    expect(
      signalTrips(sig('a', 'service outage today'), { match: 'outage|breach', regex: true }),
    ).toBe(true);
  });

  it('a bad regex never matches instead of throwing', () => {
    expect(signalTrips(sig('a', 'anything'), { match: '(', regex: true })).toBe(false);
  });

  it('respects a source restriction', () => {
    const tw = { match: 'x', sources: ['only-this'] };
    expect(signalTrips(sig('a', 'x', '', 'other'), tw)).toBe(false);
    expect(signalTrips(sig('a', 'x', '', 'only-this'), tw)).toBe(true);
  });
});

describe('beatHits', () => {
  const beat: BeatConfig = {
    id: 'b',
    name: 'B',
    sources: [],
    tripwires: [{ match: 'incident' }, { match: 'breach' }],
  };

  it('returns each tripped signal once', () => {
    const signals = [
      sig('1', 'security incident and breach'), // trips both, counted once
      sig('2', 'all quiet'),
      sig('3', 'a breach report'),
    ];
    const hits = beatHits(beat, signals);
    expect(hits.map((h) => h.signal.id)).toEqual(['1', '3']);
  });

  it('returns nothing when the beat has no tripwires', () => {
    expect(beatHits({ ...beat, tripwires: [] }, [sig('1', 'incident')])).toEqual([]);
  });
});
