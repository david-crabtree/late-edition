import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listEditions } from './edition-store.js';
import { paths } from './paths.js';

/** Write a minimal edition folder, as a finished run leaves behind. */
function file(root: string, id: string, opts: { finished?: boolean; headline?: string } = {}) {
  const dir = paths(root).editionDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'edition.json'),
    JSON.stringify({
      id,
      number: 1,
      date: id.slice(0, 10),
      stories: [{ headline: opts.headline ?? 'Headline', standfirst: 'Deck.' }],
      tokenUsage: [{ provider: 'fake', role: 'writer', inputTokens: 10, outputTokens: 5 }],
    }),
  );
  if (opts.finished !== false) writeFileSync(join(dir, 'edition.html'), '<html></html>');
}

describe('the back-issues list', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-editions-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is empty, not broken, for a newsroom that has never filed', () => {
    expect(listEditions(root)).toEqual([]);
  });

  it('returns editions newest first with their lead headline and token cost', () => {
    file(root, '2026-09-08-001', { headline: 'Older story' });
    file(root, '2026-09-10-002', { headline: 'Newer story' });
    file(root, '2026-09-10-001', { headline: 'Middle story' });
    const eds = listEditions(root);
    expect(eds.map((e) => e.id)).toEqual(['2026-09-10-002', '2026-09-10-001', '2026-09-08-001']);
    expect(eds[0]?.headline).toBe('Newer story');
    expect(eds[0]?.tokens).toBe(15);
    expect(eds.every((e) => e.finished)).toBe(true);
  });

  // A run that was stopped or crashed still leaves a folder. Hiding it would make the
  // edition look lost; the list shows it and marks it as never having gone to press.
  it('lists a run that never reached the press, marked unfinished', () => {
    file(root, '2026-09-10-001', { finished: false });
    mkdirSync(paths(root).editionDir('2026-09-10-002'), { recursive: true }); // no json at all
    const eds = listEditions(root);
    expect(eds).toHaveLength(2);
    expect(eds.every((e) => !e.finished)).toBe(true);
    expect(eds[0]?.headline).toBe('Never went to press');
  });

  it('flags a Late Extra as such', () => {
    file(root, '2026-09-10-x001');
    expect(listEditions(root)[0]?.lateExtra).toBe(true);
  });
});
