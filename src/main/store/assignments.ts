import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Assignment } from '../config/types.js';
import { paths } from './paths.js';

/** Per-assignment run state, kept out of the editable config. */
export interface AssignmentState {
  lastRunAt?: string;
  lastEditionId?: string;
  runs: number;
}

/**
 * Parse a cadence string to milliseconds, or null for `manual`/unset/unrecognized (which
 * never runs automatically — only via `assignment run`). Accepts `30m`, `6h`, `1d`, `2w`,
 * and the words `hourly` / `daily` / `weekly`.
 */
export function parseCadenceMs(cadence: string | undefined): number | null {
  const c = (cadence ?? 'manual').trim().toLowerCase();
  if (c === '' || c === 'manual' || c === 'never') return null;
  const words: Record<string, number> = { hourly: 3600e3, daily: 86400e3, weekly: 604800e3 };
  if (words[c]) return words[c];
  const m = c.match(/^(\d+)\s*(m|min|h|hr|hour|d|day|w|wk|week)s?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] as string;
  const per = unit.startsWith('m')
    ? 60e3
    : unit.startsWith('h')
      ? 3600e3
      : unit.startsWith('d')
        ? 86400e3
        : 604800e3;
  return n * per;
}

function stateFile(root: string, id: string): string {
  return join(paths(root).assignmentStateDir, `${id}.json`);
}

/** Read an assignment's run state (defaults to zero runs). */
export function readAssignmentState(root: string, id: string): AssignmentState {
  try {
    return JSON.parse(readFileSync(stateFile(root, id), 'utf8')) as AssignmentState;
  } catch {
    return { runs: 0 };
  }
}

/** Record that an assignment ran, stamping the time and edition id. */
export function recordAssignmentRun(root: string, id: string, editionId: string, now: Date): void {
  const dir = paths(root).assignmentStateDir;
  mkdirSync(dir, { recursive: true });
  const prev = readAssignmentState(root, id);
  const next: AssignmentState = {
    lastRunAt: now.toISOString(),
    lastEditionId: editionId,
    runs: prev.runs + 1,
  };
  writeFileSync(stateFile(root, id), JSON.stringify(next, null, 2), 'utf8');
}

/** Is this assignment's cadence due to run at `now`? Manual assignments are never due. */
export function isDue(assignment: Assignment, state: AssignmentState, now: Date): boolean {
  const ms = parseCadenceMs(assignment.cadence);
  if (ms === null) return false;
  if (!state.lastRunAt) return true;
  return now.getTime() - new Date(state.lastRunAt).getTime() >= ms;
}

/** Human-readable status for the `assignment list` view. */
export function assignmentStatus(
  assignment: Assignment,
  state: AssignmentState,
  now: Date,
): { cadence: string; lastRun: string; runs: number; due: boolean; auto: boolean } {
  const auto = parseCadenceMs(assignment.cadence) !== null;
  return {
    cadence: assignment.cadence || 'manual',
    lastRun: state.lastRunAt ? state.lastRunAt.slice(0, 16).replace('T', ' ') : 'never',
    runs: state.runs,
    due: isDue(assignment, state, now),
    auto,
  };
}

/** True if a newsroom has any assignment state on disk (used to hint first-run). */
export function hasAssignmentState(root: string): boolean {
  return existsSync(paths(root).assignmentStateDir);
}
