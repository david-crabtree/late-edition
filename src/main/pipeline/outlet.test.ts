import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import {
  type CopyShape,
  OUTLETS,
  getOutlet,
  headlineDirective,
  houseStyleFor,
  positionDirective,
  shapeDirective,
} from '../core/formats.js';
import { renderHtml, renderMarkdown } from '../paper/render.js';
import { paths } from '../store/paths.js';
import { defaultPrompts, renderTemplate } from './prompts.js';
import { runEdition } from './run.js';

/**
 * The masthead has to reach the desks that decide what the story IS, not only the desk
 * that types it. A style that changed the body alone would leave a red-top splash sitting
 * under a broadsheet headline, which is the bug this whole thing exists to prevent.
 */
describe('the masthead reaches every desk', () => {
  const prompts = defaultPrompts();

  it('leaves a slot for it in the reporter, editor, picture and front-page prompts', () => {
    expect(prompts.reporter).toContain('{{position}}');
    expect(prompts.editor).toContain('{{position}}');
    expect(prompts.editor).toContain('{{headlineStyle}}');
    expect(prompts.photo).toContain('{{position}}');
    expect(prompts.frontpage).toContain('{{position}}');
  });

  it('names the paper to the reporter, and its headline rules to the editor', () => {
    const shape: CopyShape = { outlet: 'moon' };
    const reporter = renderTemplate(prompts.reporter, {
      position: positionDirective(shape),
    });
    const editor = renderTemplate(prompts.editor, {
      position: positionDirective(shape),
      headlineStyle: headlineDirective(shape),
    });
    expect(reporter).toContain('The Moon');
    expect(reporter).toContain('WHAT IT LEADS ON');
    expect(editor).toContain('The Moon');
    expect(editor).toContain('five to eight words');
  });

  // Two papers must actually want different things, or the picker is decoration.
  it('gives a red-top and an agency wire genuinely different instructions', () => {
    const red = positionDirective({ outlet: 'moon' });
    const agency = positionDirective({ outlet: 'wire' });
    expect(red).not.toBe(agency);
    expect(red).toMatch(/who pays/i);
    expect(agency).toMatch(/no interpretation/i);
    expect(headlineDirective({ outlet: 'moon' })).not.toBe(headlineDirective({ outlet: 'wire' }));
  });

  // Every outlet, however loud, is told in the same breath that it cannot bend a fact.
  it('never lets a masthead lower the bar', () => {
    for (const o of OUTLETS) {
      expect(positionDirective({ outlet: o.id })).toMatch(/never changes a fact/i);
    }
  });
});

describe('an outlet with no front page', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-outlet-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const events = (editionId: string) =>
    readFileSync(join(paths(root).editionDir(editionId), 'log.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { stage?: string; event?: string });

  // A LinkedIn post has no weather line and no front page to lay out, so the editor call
  // that would have written them is skipped — the choice reaches the pipeline, and it is
  // cheaper rather than merely different.
  it('skips the front-page call, and a paper still gets one', async () => {
    const post = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'a topic',
      research: 0,
      shape: { outlet: 'linkedin' },
    });
    expect(events(post.editionId).some((e) => e.event === 'no_front_page')).toBe(true);

    const paper = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'another topic',
      research: 0,
      shape: { outlet: 'chronicle' },
    });
    expect(events(paper.editionId).some((e) => e.event === 'no_front_page')).toBe(false);
  });

  it('knows which outlets have a front page at all', () => {
    expect(getOutlet('chronicle').kind).toBe('paper');
    expect(getOutlet('linkedin').kind).toBe('social');
    expect(OUTLETS.filter((o) => o.kind === 'paper').length).toBeGreaterThan(3);
  });
});

/**
 * The first real edition written as a LinkedIn post came out with a masthead, a headline,
 * a 45-word standfirst, a fictional byline, "From the morgue", the editor's private
 * rationale, and numbered footnotes through the prose. There was nothing in it you could
 * paste anywhere. These are the two halves of why.
 */
describe('a post is a post, not a newspaper about one', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-post-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (outlet: CopyShape['outlet']) =>
    runEdition({ root, forceProvider: 'fake', brief: 'a topic', research: 1, shape: { outlet } });

  it('prints none of the paper furniture, and keeps the notice', async () => {
    const res = await run('linkedin');
    const md = renderMarkdown(res.edition);
    const html = renderHtml(res.edition);
    for (const out of [md, html]) {
      expect(out).not.toContain('The Daily Bit');
      expect(out).not.toContain('Page One');
      expect(out).not.toContain('Below the Fold');
      expect(out).not.toMatch(/From the morgue/i);
      expect(out).not.toMatch(/Editor.s note/i);
      expect(out).not.toMatch(/\bBy Sam Vance\b/);
      // The one thing that must survive every outlet.
      expect(out).toContain('This is not journalism');
    }
    // A social post carries no bracketed footnote markers in the prose at all.
    expect(md.split('Sources')[0]).not.toMatch(/\[\d+(,\d+)*\]/);
  });

  it('still lays a paper out as a paper', async () => {
    const res = await run('chronicle');
    const md = renderMarkdown(res.edition);
    expect(md).toContain('The Daily Bit');
    expect(md).toMatch(/Page One|Below the Fold/);
  });

  it('lists only the sources the piece actually leans on', async () => {
    const res = await run('linkedin');
    const story = res.edition.stories[0];
    if (!story) return;
    const cited = new Set(
      [...story.body.matchAll(/\[([a-z0-9_]+:[0-9a-f]{6,})\]/gi)].map((m) => m[1]),
    );
    const md = renderMarkdown(res.edition);
    for (const ref of story.sources) {
      if (!cited.has(ref.signalId)) expect(md).not.toContain(ref.title);
    }
  });

  // An edition filed before outlets existed has no outlet on it, and must still render.
  it('treats an edition with no outlet as the house paper', async () => {
    const res = await run('newspaper');
    const legacy = { ...res.edition, outlet: undefined };
    expect(renderMarkdown(legacy)).toContain('The Daily Bit');
  });
});

describe('the house style belongs to the house paper', () => {
  // A LinkedIn post handed BOTH the noir style guide and its own voice wrote in both at
  // once, and — because the house style says "say plainly where the evidence stops" —
  // spent a paragraph narrating its own sourcing instead of reporting.
  it('passes style.md to the house paper and to nobody else', () => {
    const style = '# House style\nA 1940s wire desk. Terse, dry, unimpressed.';
    expect(houseStyleFor({ outlet: 'newspaper' }, style)).toBe(style);
    for (const id of ['moon', 'chronicle', 'linkedin', 'reddit', 'blog', 'brief'] as const) {
      const given = houseStyleFor({ outlet: id }, style);
      expect(given).not.toContain('1940s wire desk');
      expect(given).toMatch(/not applicable/i);
    }
  });

  it('tells every outlet not to narrate its own working', () => {
    for (const o of OUTLETS) {
      const d = shapeDirective({ outlet: o.id });
      expect(d).toMatch(/never write about your own working/i);
      expect(d).toMatch(/CUT THE CLAIM/);
      expect(d).toMatch(/what stays with me/i);
    }
  });
});
