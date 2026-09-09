import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Edition } from '../core/edition.js';
import { relatedCoverage, scanMorgue, searchMorgue, terms } from './morgue.js';
import { paths } from './paths.js';

let root: string;

function writeEdition(id: string, number: number, headline: string): void {
  const dir = paths(root).editionDir(id);
  mkdirSync(dir, { recursive: true });
  const ed: Edition = {
    id,
    number,
    date: '2026-09-09',
    paperName: 'The Daily Bit',
    stories: [
      {
        slug: 's',
        beatId: 'the_codebase',
        beatName: 'The Codebase',
        headline,
        standfirst: '',
        body: '',
        byline: 'R',
        placement: 'page_one',
        chosenAngle: '',
        rationale: '',
        sources: [],
        reports: [],
      },
    ],
    briefs: [],
    editorsLog: [],
    corrections: [],
    tokenUsage: [],
    generatedAt: '2026-09-09T12:00:00.000Z',
  };
  writeFileSync(join(dir, 'edition.json'), JSON.stringify(ed));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'le-morgue-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('morgue', () => {
  it('terms drops stopwords and short words', () => {
    expect(terms('The new Widget Factory ships')).toEqual(
      expect.arrayContaining(['widget', 'factory', 'ships']),
    );
    expect(terms('the new')).toEqual([]);
  });

  it('scans editions into flat entries, newest first', () => {
    writeEdition('2026-09-09-001', 1, 'Widget factory ships version two');
    writeEdition('2026-09-09-002', 2, 'Widget factory recalls version two');
    const entries = scanMorgue(root);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.editionId).toBe('2026-09-09-002');
  });

  it('search ranks headline matches', () => {
    writeEdition('2026-09-09-001', 1, 'Widget factory ships version two');
    writeEdition('2026-09-09-002', 2, 'Unrelated lunch menu update');
    const hits = searchMorgue(root, 'widget factory');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.headline).toContain('Widget factory');
  });

  it('relatedCoverage finds prior stories sharing terms, excluding the current edition', () => {
    writeEdition('2026-09-09-001', 1, 'Widget factory ships version two');
    const archive = scanMorgue(root);
    const related = relatedCoverage(
      archive,
      { terms: terms('Widget factory recalls version two'), beatId: 'the_codebase' },
      '2026-09-09-002',
    );
    expect(related).toHaveLength(1);
    expect(related[0]?.editionId).toBe('2026-09-09-001');
  });
});
