import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import { runEdition } from './run.js';

describe('the picture desk', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-photo-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (photoDesk: boolean) =>
    runEdition({ root, forceProvider: 'fake', brief: 'a topic', research: 0, photoDesk });

  it('stays out of the way unless it is switched on', async () => {
    const res = await run(false);
    expect(res.edition.stories.every((s) => !s.photo)).toBe(true);
    expect(res.edition.tokenUsage.some((u) => u.role === 'photo')).toBe(false);
  });

  it('files a brief per story when it is switched on', async () => {
    const res = await run(true);
    expect(res.edition.tokenUsage.some((u) => u.role === 'photo')).toBe(true);
  });

  // The one thing this desk must never do is imply a photograph exists. Both renderers
  // say what it is, in the artefact, so a reader of the file is never misled.
  it('labels the brief as a brief in the rendered paper', async () => {
    const res = await run(true);
    const story = res.edition.stories[0];
    if (!story) return;
    story.photo = {
      shotList: ['Archive shot of the exchange floor'],
      caption: 'Traders on the floor, in a file picture.',
      altText: 'A crowded trading floor.',
    };
    for (const rendered of [renderMarkdown(res.edition), renderHtml(res.edition)]) {
      expect(rendered).toContain('Picture desk');
      expect(rendered).toMatch(/no image/i);
      expect(rendered).toContain('Alt text');
      expect(rendered).toContain('Archive shot of the exchange floor');
    }
  });
});
