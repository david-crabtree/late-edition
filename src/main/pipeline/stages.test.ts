import { describe, expect, it } from 'vitest';
import type { Signal } from '../core/signal.js';
import type { StoryDraft } from './draft.js';
import { verifyCopyCitations } from './stages.js';

function story(copy: string, signalIds: string[]): StoryDraft {
  const signals: Signal[] = signalIds.map((id) => ({
    id,
    sourceId: 'src',
    sourceType: 'folder',
    timestamp: '2026-09-09T00:00:00Z',
    title: id,
    body: '',
    hash: id.split(':')[1] ?? id,
  }));
  return {
    slug: 's',
    beatId: 'b',
    beatName: 'B',
    signals,
    reporterName: 'R',
    reporterProviderId: 'fake',
    reports: [],
    copy,
  };
}

describe('verifyCopyCitations (deterministic copy desk)', () => {
  it('passes when every citation resolves to a real signal', () => {
    const c = verifyCopyCitations(story('Big news [src:aabbccddeeff].', ['src:aabbccddeeff']));
    expect(c.pass).toBe(true);
    expect(c.corrections).toHaveLength(0);
  });

  it('flags a citation that is not in the story materials', () => {
    const c = verifyCopyCitations(
      story('Claim [src:deadbeef0000] and [src:aabbccddeeff].', ['src:aabbccddeeff']),
    );
    expect(c.pass).toBe(false);
    expect(c.corrections.some((x) => x.claim.includes('deadbeef0000'))).toBe(true);
    expect(c.injectionFlags.length).toBeGreaterThan(0);
  });

  it('flags copy that makes claims but cites nothing verifiable', () => {
    const c = verifyCopyCitations(story('A confident, uncited assertion.', ['src:aabbccddeeff']));
    expect(c.injectionFlags.some((f) => /cited no verifiable/.test(f))).toBe(true);
  });
});
