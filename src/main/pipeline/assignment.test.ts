import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { readAssignmentState } from '../store/assignments.js';
import { assignmentCoverage } from '../store/morgue.js';
import { paths } from '../store/paths.js';
import { runAssignment, runDueAssignments } from './assignment.js';

describe('standing assignments (fake provider, offline)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-assign-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('runs the scaffolded assignment, tags the edition, and records the run', async () => {
    const { result } = await runAssignment(root, 'competitor-watch', {
      forceProvider: 'fake',
      now: new Date('2026-09-10T09:00:00Z'),
    });
    expect(result.edition.assignmentId).toBe('competitor-watch');
    expect(result.edition.stories.length).toBeGreaterThan(0);

    const state = readAssignmentState(root, 'competitor-watch');
    expect(state.runs).toBe(1);
    expect(state.lastEditionId).toBe(result.editionId);
    expect(assignmentCoverage(root, 'competitor-watch').length).toBeGreaterThan(0);
  });

  it('feeds a second run the prior coverage so it builds on its own history', async () => {
    const first = await runAssignment(root, 'competitor-watch', {
      forceProvider: 'fake',
      now: new Date('2026-09-10T09:00:00Z'),
    });
    const second = await runAssignment(root, 'competitor-watch', {
      forceProvider: 'fake',
      now: new Date('2026-09-11T09:00:00Z'),
    });

    // The first run had no history; the second's brief carries a prior-coverage block.
    const brief = (id: string) =>
      JSON.parse(readFileSync(join(paths(root).editionDir(id), 'pipeline.json'), 'utf8')).stories[0]
        .signals[0].body as string;
    expect(brief(first.result.editionId)).not.toContain(
      'Prior coverage of this ongoing assignment',
    );
    expect(brief(second.result.editionId)).toContain('Prior coverage of this ongoing assignment');
    expect(readAssignmentState(root, 'competitor-watch').runs).toBe(2);
  });

  it('tick runs only the assignments whose cadence is due', async () => {
    const dir = paths(root).assignmentsDir;
    writeFileSync(
      join(dir, 'due.yaml'),
      'id: due\ntitle: Due\nbrief: "a due topic"\ncadence: 1h\n',
    );
    // The scaffolded competitor-watch is `manual`, so it should be skipped.
    const outcomes = await runDueAssignments(root, {
      forceProvider: 'fake',
      now: new Date('2026-09-10T09:00:00Z'),
    });
    const ids = outcomes.map((o) => o.id);
    expect(ids).toContain('due');
    expect(ids).not.toContain('competitor-watch');
    expect(outcomes.find((o) => o.id === 'due')?.ran).toBe(true);
  });
});
