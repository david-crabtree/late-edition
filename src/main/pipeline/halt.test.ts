import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { PipelineHaltError, clearHalt, isHalted, setHalt } from '../store/halt.js';
import { runEdition } from './run.js';

describe('the stop switch (halt)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-halt-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('stops a run before any agent call and stays resumable, then completes once cleared', async () => {
    setHalt(root, 'testing');
    expect(isHalted(root)).toBe(true);

    let editionId: string | undefined;
    try {
      await runEdition({ root, forceProvider: 'fake', brief: 'a topic', now: new Date() });
      throw new Error('run should have halted');
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineHaltError);
      editionId = (err as PipelineHaltError).editionId;
    }
    expect(editionId).toBeDefined();

    // Clearing the switch and resuming carries the same edition through to a printed paper.
    clearHalt(root);
    expect(isHalted(root)).toBe(false);
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      resumeId: editionId,
      now: new Date(),
    });
    expect(result.edition.stories.length).toBeGreaterThan(0);
  });
});
