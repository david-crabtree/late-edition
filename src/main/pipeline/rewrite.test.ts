import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { FORMATS, shapeDirective } from '../core/formats.js';
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
      shape: { format: 'linkedin', tone: 'conversational', length: 'short' },
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
      shape: { format: 'newsletter' },
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
      shape: { format: 'reddit' },
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

describe('the shape directive handed to the writer', () => {
  it('names the format, the length and the tone', () => {
    const d = shapeDirective({ format: 'linkedin', tone: 'analytical', length: 'long' });
    expect(d).toContain('LinkedIn post');
    expect(d).toContain('LENGTH');
    expect(d).toContain('TONE');
  });

  // Format and tone are allowed to change the voice. They are never allowed to loosen the
  // citation contract — that contract is the only reason the output is worth anything.
  it('holds the citation rules in every format', () => {
    for (const f of FORMATS) {
      const d = shapeDirective({ format: f.id });
      expect(d).toMatch(/may change a fact|citation rules/i);
    }
  });

  it('falls back to the house newspaper story when nothing is chosen', () => {
    expect(shapeDirective()).toContain('Newspaper story');
    expect(shapeDirective({ format: 'nonsense' as never })).toContain('Newspaper story');
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
