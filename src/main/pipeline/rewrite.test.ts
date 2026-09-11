import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { OUTLETS, headlineDirective, positionDirective, shapeDirective } from '../core/formats.js';
import { paths } from '../store/paths.js';
import { rewriteStory, withSources } from './rewrite.js';
import { runEdition } from './run.js';

describe('writing a filed story again in another shape', () => {
  let root: string;
  let editionId: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'le-rewrite-'));
    scaffoldNewsroom(root);
    const res = await runEdition({ root, forceProvider: 'fake', brief: 'the price of tea' });
    editionId = res.editionId;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reuses the finished reporting instead of running a new edition', async () => {
    const before = readFileSync(join(paths(root).editionDir(editionId), 'edition.json'), 'utf8');
    const out = await rewriteStory({
      root,
      editionId,
      forceProvider: 'fake',
      shape: { outlet: 'linkedin', length: 'short' },
    });
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.formatLabel).toBe('LinkedIn post');
    // The edition it came from is untouched — a rewrite is a derivative, not a rerun.
    expect(readFileSync(join(paths(root).editionDir(editionId), 'edition.json'), 'utf8')).toBe(
      before,
    );
  });

  it('leaves readable numbered citations, never raw signal ids', async () => {
    const out = await rewriteStory({
      root,
      editionId,
      forceProvider: 'fake',
      shape: { outlet: 'newsletter' },
    });
    expect(out.text).not.toMatch(/\[[a-z0-9_]+:[0-9a-f]{6,}\]/i);
    expect(out.text).not.toMatch(/\[#\d+\]|\[ref\]/i);
    for (const s of out.sources) expect(s.title.length).toBeGreaterThan(0);
  });

  it('files the rewrite next to the edition it came from', async () => {
    const out = await rewriteStory({
      root,
      editionId,
      forceProvider: 'fake',
      shape: { outlet: 'reddit' },
    });
    const file = join(paths(root).editionDir(editionId), `rewrite-${out.slug}-reddit.md`);
    expect(readFileSync(file, 'utf8')).toContain(out.text.slice(0, 40));
  });

  it('reports a story that is not there rather than inventing one', async () => {
    await expect(
      rewriteStory({ root, editionId, slug: 'no-such-story', shape: {} }),
    ).rejects.toThrow(/No story/);
  });
});

describe('the directives an outlet hands the desks', () => {
  it('names the paper, its voice and the length for the writer', () => {
    const d = shapeDirective({ outlet: 'linkedin', length: 'long' });
    expect(d).toContain('LinkedIn post');
    expect(d).toContain('VOICE');
    expect(d).toContain('LENGTH');
  });

  // The point of an outlet is that it reaches the desks that decide what the story IS,
  // not only the desk that types it. A tone that only changes the body leaves a red-top
  // splash under a broadsheet headline.
  it('tells the reporter and the editor which paper they are filing for', () => {
    for (const o of OUTLETS) {
      expect(positionDirective({ outlet: o.id })).toContain(o.label);
      expect(positionDirective({ outlet: o.id })).toContain('WHAT IT LEADS ON');
      expect(headlineDirective({ outlet: o.id })).toContain('HEADLINES');
    }
  });

  // An outlet is allowed to change the voice and the judgement. It is never allowed to
  // loosen the citation contract — that contract is the only reason the output is worth
  // anything — or to move the bar a fact has to clear.
  it('holds the citation rules and the facts in every outlet', () => {
    for (const o of OUTLETS) {
      expect(shapeDirective({ outlet: o.id })).toMatch(/may change a fact|citation rules/i);
      expect(positionDirective({ outlet: o.id })).toMatch(/never changes a fact/i);
    }
  });

  it('falls back to the house paper when nothing is chosen', () => {
    expect(shapeDirective()).toContain('The house paper');
    expect(shapeDirective({ outlet: 'nonsense' as never })).toContain('The house paper');
  });
});

describe('appending sources to a rewrite', () => {
  it('lists them in citation order, with links where there are any', () => {
    const out = withSources('Body [1].', [
      { n: 1, title: 'A source', url: 'https://example.test' },
      { n: 2, title: 'No link' },
    ]);
    expect(out).toContain('[1] A source — https://example.test');
    expect(out).toContain('[2] No link');
  });

  it('adds nothing when there were no sources', () => {
    expect(withSources('Body.', [])).toBe('Body.');
  });
});

describe('citation style follows the format', () => {
  let root: string;
  let editionId: string;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'le-cite-'));
    scaffoldNewsroom(root);
    const res = await runEdition({ root, forceProvider: 'fake', brief: 'the price of tea' });
    editionId = res.editionId;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // A bracketed footnote number in a LinkedIn post is a tell that a machine wrote it.
  // Social formats get their sources listed at the end instead, with clean prose.
  it('leaves no bracketed markers in a social post', async () => {
    for (const outlet of ['linkedin', 'reddit', 'newsletter'] as const) {
      const out = await rewriteStory({ root, editionId, forceProvider: 'fake', shape: { outlet } });
      expect(out.text).not.toMatch(/\[\d+(,\d+)*\]/);
    }
  });

  it('keeps numbered markers where the piece reads as a document', () => {
    for (const id of ['newspaper', 'moon', 'chronicle', 'ledger', 'wire', 'blog'] as const) {
      expect(OUTLETS.find((o) => o.id === id)?.citations).toBe('numbered');
    }
    for (const id of ['linkedin', 'reddit', 'newsletter'] as const) {
      expect(OUTLETS.find((o) => o.id === id)?.citations).toBe('plain');
    }
  });

  it('offers papers and posts alike, and warns every one off the AI tells', () => {
    const ids = OUTLETS.map((o) => o.id);
    for (const id of ['moon', 'chronicle', 'ledger', 'wire', 'circuit', 'blog', 'linkedin']) {
      expect(ids).toContain(id);
    }
    for (const o of OUTLETS) {
      expect(shapeDirective({ outlet: o.id })).toMatch(/read as machine-made/);
    }
  });
});
