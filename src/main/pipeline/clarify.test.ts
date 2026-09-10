import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { ClarificationNeededError } from './clarify.js';
import { runEdition } from './run.js';

describe('clarification requests (the Chief asks before running a vague brief)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-clarify-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('pauses a vague brief with questions, then resumes to a printed paper once answered', async () => {
    let questions: string[] = [];
    let editionId: string | undefined;
    try {
      // The fake triage treats a trailing "?" as vague.
      await runEdition({ root, forceProvider: 'fake', brief: 'Tell me about the thing?' });
      throw new Error('run should have paused for clarification');
    } catch (err) {
      expect(err).toBeInstanceOf(ClarificationNeededError);
      questions = (err as ClarificationNeededError).questions;
      editionId = (err as ClarificationNeededError).editionId;
    }
    expect(questions.length).toBeGreaterThan(0);
    expect(editionId).toBeDefined();

    const result = await runEdition({
      root,
      forceProvider: 'fake',
      resumeId: editionId,
      clarificationAnswer: 'Focus on the UK market in 2026.',
    });
    expect(result.edition.stories.length).toBeGreaterThan(0);
  });

  it('a clear brief runs straight through without pausing', async () => {
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'The state of open-source AI newsroom tools in 2026',
    });
    expect(result.edition.stories.length).toBeGreaterThan(0);
  });

  it('--no-clarify (clarify:false) runs a vague brief without asking', async () => {
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'a vague thing?',
      clarify: false,
    });
    expect(result.edition.stories.length).toBeGreaterThan(0);
  });
});
