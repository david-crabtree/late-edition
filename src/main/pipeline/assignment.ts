import { loadNewsroom } from '../config/newsroom.js';
import type { Assignment } from '../config/types.js';
import { isDue, readAssignmentState, recordAssignmentRun } from '../store/assignments.js';
import { type CoverageItem, assignmentCoverage } from '../store/morgue.js';
import { type RunResult, runEdition } from './run.js';

export interface AssignmentRunOptions {
  forceProvider?: string;
  now?: Date;
}

/** Render an assignment's recent editions into the compact context a new run builds on. */
function formatCoverage(items: CoverageItem[]): string {
  return items
    .map((c) => `- ${c.date}: ${c.headline}${c.standfirst ? ` — ${c.standfirst}` : ''}`)
    .join('\n');
}

/**
 * Run one standing assignment: seed its brief with the newsroom's prior coverage of it (so the
 * desk advances the story instead of repeating it), produce an edition tagged with the
 * assignment, and stamp the run. This is the "run the story" trigger.
 */
export async function runAssignment(
  root: string,
  id: string,
  opts: AssignmentRunOptions = {},
): Promise<{ assignment: Assignment; result: RunResult }> {
  const newsroom = await loadNewsroom(root);
  const assignment = newsroom.assignments.find((a) => a.id === id);
  if (!assignment) {
    const known = newsroom.assignments.map((a) => a.id).join(', ') || '(none)';
    throw new Error(`No assignment "${id}" in this newsroom. Known: ${known}.`);
  }
  const now = opts.now ?? new Date();
  const coverage = assignmentCoverage(root, id, 5);
  const result = await runEdition({
    root,
    brief: assignment.brief,
    assignmentId: id,
    priorContext: coverage.length ? formatCoverage(coverage) : undefined,
    research: assignment.research,
    maxFindings: assignment.maxFindings,
    forceProvider: opts.forceProvider ?? assignment.provider,
    clarify: false, // a standing assignment is pre-defined; autonomous runs don't pause to ask
    now,
  });
  recordAssignmentRun(root, id, result.editionId, now);
  return { assignment, result };
}

export interface DueRunOutcome {
  id: string;
  ran: boolean;
  editionId?: string;
  stories?: number;
  error?: string;
}

/**
 * Run every assignment whose cadence is due at `now` — the cadence engine a scheduler/cron
 * calls. Each is independent: one failing doesn't stop the rest. Manual assignments are skipped.
 */
export async function runDueAssignments(
  root: string,
  opts: AssignmentRunOptions = {},
): Promise<DueRunOutcome[]> {
  const newsroom = await loadNewsroom(root);
  const now = opts.now ?? new Date();
  const outcomes: DueRunOutcome[] = [];
  for (const assignment of newsroom.assignments) {
    if (!isDue(assignment, readAssignmentState(root, assignment.id), now)) continue;
    try {
      const { result } = await runAssignment(root, assignment.id, opts);
      outcomes.push({
        id: assignment.id,
        ran: true,
        editionId: result.editionId,
        stories: result.edition.stories.length,
      });
    } catch (err) {
      outcomes.push({
        id: assignment.id,
        ran: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}
