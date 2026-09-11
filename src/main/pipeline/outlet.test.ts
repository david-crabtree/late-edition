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
  positionDirective,
} from '../core/formats.js';
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
