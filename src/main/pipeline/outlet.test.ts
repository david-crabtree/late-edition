import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { PROJECT_URL, sourceLine } from '../core/disclaimer.js';
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

  // The last real run's chosen angle said, in as many words, "Kept the explicit
  // non-causation line". The writer is told to lead with the angle, so a rule that only
  // reached the writer could never win. It has to reach the desk that commissions.
  it('forbids the editor from commissioning a caveat', () => {
    expect(prompts.editor).toMatch(/NEVER COMMISSION A CAVEAT/);
    expect(prompts.editor).toMatch(/belongs in "rationale"/);
    expect(prompts.editor).toMatch(/none of it belongs in "chosenAngle"/);
    // And the writer is told the angle's own caveats are for it, not for the reader.
    expect(prompts.writer).toMatch(/that note is for you and not for the reader/);
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

/**
 * What travels with the text once it leaves the app. Output from this gets pasted into
 * blogs and posts by people who did not generate it, so what a stranger reads at the other
 * end has to be honest without any of the surrounding app.
 */
describe('what a copied edition says for itself', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-credit-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (outlet: CopyShape['outlet']) =>
    runEdition({ root, forceProvider: 'fake', brief: 'a topic', research: 1, shape: { outlet } });

  // The reporter persona shapes the voice. It is not an author, and crediting one on
  // something a reader might take for journalism is a claim by a person who does not exist.
  it('credits no human author, in any outlet', async () => {
    for (const outlet of ['newspaper', 'moon', 'linkedin'] as const) {
      const res = await run(outlet);
      for (const out of [renderMarkdown(res.edition), renderHtml(res.edition)]) {
        expect(out).not.toMatch(/\bBy Sam Vance\b/);
        expect(out).not.toMatch(/class="byline"/);
      }
      // The persona is still recorded — it is the byline field that stops being printed.
      expect(res.edition.stories[0]?.byline).toBeTruthy();
    }
  });

  it('says what made it, in every artefact', async () => {
    for (const outlet of ['newspaper', 'linkedin'] as const) {
      const res = await run(outlet);
      for (const out of [renderMarkdown(res.edition), renderHtml(res.edition)]) {
        expect(out).toContain('Late Edition');
        expect(out).toContain('an AI newsroom you run on your own machine');
        expect(out).toContain('This is not journalism');
      }
    }
  });

  // Set the project URL and it has to reach the reader, as a link in the HTML and as a
  // bare address in the Markdown — a link is no use to someone reading pasted plain text.
  it('carries the address once there is one to carry', () => {
    if (!PROJECT_URL) {
      expect(sourceLine()).not.toMatch(/https?:/);
      return;
    }
    expect(sourceLine()).toContain(PROJECT_URL);
  });
});

/**
 * A follow-up, and what happens to the masthead when a run is interrupted.
 *
 * Ida's follow-up goes through the same pipeline as everything else and carries whatever
 * the picker is set to. The gap was the resume: the outlet was written onto the draft so
 * the renderer kept it, but the desks were told nothing, so an edition half written as a
 * LinkedIn post could finish being told it was the house paper.
 */
describe('an interrupted run keeps the paper it started as', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-resume-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const events = (editionId: string) =>
    readFileSync(join(paths(root).editionDir(editionId), 'log.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { event?: string });

  it('finishes as the paper it began as, even resumed with nothing said', async () => {
    // Stops to ask, because the stand-in files a thin story.
    let editionId = '';
    try {
      await runEdition({
        root,
        forceProvider: 'fake',
        brief: 'a thin topic',
        research: 0,
        askToVerify: true,
        shape: { outlet: 'linkedin' },
      });
    } catch (err) {
      editionId = (err as { editionId?: string }).editionId ?? '';
    }
    expect(editionId, 'the run did not stop to ask').toBeTruthy();

    // Resumed by something that does not know, or bother to say, which paper this was.
    const done = await runEdition({
      root,
      forceProvider: 'fake',
      resumeId: editionId,
      verifyAnswer: true,
      research: 0,
    });
    expect(done.edition.outlet).toBe('linkedin');
    // The desks were told too, not just the renderer: a post has no front page to lay out.
    expect(events(editionId).some((e) => e.event === 'no_front_page')).toBe(true);
    expect(renderMarkdown(done.edition)).not.toContain('The Daily Bit');
  });

  it('still lets an explicit choice override what the draft remembers', async () => {
    let editionId = '';
    try {
      await runEdition({
        root,
        forceProvider: 'fake',
        brief: 'another thin topic',
        research: 0,
        askToVerify: true,
        shape: { outlet: 'linkedin' },
      });
    } catch (err) {
      editionId = (err as { editionId?: string }).editionId ?? '';
    }
    const done = await runEdition({
      root,
      forceProvider: 'fake',
      resumeId: editionId,
      verifyAnswer: false,
      shape: { outlet: 'chronicle' },
    });
    expect(done.edition.outlet).toBe('chronicle');
    expect(renderMarkdown(done.edition)).toContain('The Daily Bit');
  });
});
