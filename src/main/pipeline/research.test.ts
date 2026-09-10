import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { findingToSignal, normalizeFindings } from './stages.js';

describe('normalizeFindings (guarding against unsourced claims)', () => {
  it('keeps findings with a real http(s) URL and a title', () => {
    const out = normalizeFindings({
      findings: [
        {
          title: 'A real one',
          summary: 'says a thing',
          url: 'https://example.com/a',
          relevance: 2,
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.relevance).toBe(1); // clamped to 0..1
  });

  it('drops findings with no usable URL — an unsourced claim never reaches the paper', () => {
    const out = normalizeFindings({
      findings: [
        { title: 'No source', summary: 'trust me' },
        { title: 'Bad scheme', summary: 'x', url: 'javascript:alert(1)' },
        { title: '', summary: 'no title', url: 'https://example.com/x' },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it('tolerates a missing/garbage dossier', () => {
    expect(normalizeFindings(undefined)).toEqual([]);
    expect(normalizeFindings({ findings: undefined as never })).toEqual([]);
  });
});

describe('findingToSignal', () => {
  it('produces a citable research signal id and preserves the source URL', () => {
    const sig = findingToSignal(
      { title: 'T', summary: 'S', url: 'https://example.com/x', relevance: 0.8 },
      new Date('2026-09-09T00:00:00Z'),
    );
    expect(sig.sourceType).toBe('research');
    expect(sig.url).toBe('https://example.com/x');
    // The id must match the copy desk's citation pattern [sourceId:hexhash].
    expect(sig.id).toMatch(/^research:[0-9a-f]{6,}$/);
  });

  it('is stable: the same finding yields the same id (dedupe across passes works)', () => {
    const f = { title: 'T', summary: 'S', url: 'https://example.com/x' };
    const a = findingToSignal(f, new Date('2026-01-01T00:00:00Z'));
    const b = findingToSignal(f, new Date('2027-01-01T00:00:00Z'));
    expect(a.id).toBe(b.id);
  });
});

describe('a --brief run researches by default (fake provider, offline)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-research-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('digs up sourced findings and the finished story cites them', async () => {
    const { runEdition } = await import('./run.js');
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'The state of open-source newsroom tooling',
      now: new Date('2026-09-09T12:00:00Z'),
    });

    // A research dossier was written and research signals reached the paper.
    const story = result.edition.stories[0];
    expect(story).toBeDefined();
    const researchRefs = (story?.sources ?? []).filter((r) => r.signalId.startsWith('research:'));
    expect(researchRefs.length).toBeGreaterThan(0);

    const md = readFileSync(join(result.editionDir, 'edition.md'), 'utf8');
    for (const ref of researchRefs) expect(md).toContain(ref.signalId);

    // Token accounting attributes spend to the researcher tier.
    expect(result.edition.tokenUsage.some((u) => u.role === 'researcher')).toBe(true);
  });

  it('--research 0 disables the dig even for a brief', async () => {
    const { runEdition } = await import('./run.js');
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'A topic we do not want to research',
      research: 0,
      now: new Date('2026-09-09T12:00:00Z'),
    });
    expect(result.edition.tokenUsage.some((u) => u.role === 'researcher')).toBe(false);
  });
});
