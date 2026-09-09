import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Newsroom, RoleAssignment } from '../config/types.js';
import type { Signal } from '../core/signal.js';
import { getProvider } from '../providers/registry.js';
import type { AgentJob, AgentProvider, AgentRole } from '../providers/types.js';
import { runToText } from '../providers/types.js';
import { extractJson } from './json.js';

export interface ResolvedRole {
  providerId: string;
  model?: string;
  provider: AgentProvider;
}

function resolve(assignment: RoleAssignment, force?: string): ResolvedRole {
  const providerId = force ?? assignment.provider;
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(
      `No provider registered with id "${providerId}". Check newsroom/staff.yaml (or --provider).`,
    );
  }
  // A forced provider ignores the configured model; 'best_available' lets the provider decide.
  const model = force
    ? undefined
    : assignment.model && assignment.model !== 'best_available'
      ? assignment.model
      : undefined;
  return { providerId, model, provider };
}

export function resolveEditor(newsroom: Newsroom, force?: string): ResolvedRole {
  return resolve(newsroom.staff.managingEditor, force);
}

export function resolveReporter(newsroom: Newsroom, beatId: string, force?: string): ResolvedRole {
  return resolve(newsroom.staff.reporters[beatId] ?? newsroom.staff.reporters.default, force);
}

export function resolveWriter(newsroom: Newsroom, beatId: string, force?: string): ResolvedRole {
  return resolve(newsroom.staff.writers[beatId] ?? newsroom.staff.writers.default, force);
}

export function resolveCopyDesk(newsroom: Newsroom, force?: string): ResolvedRole {
  return resolve(newsroom.staff.copyDesk, force);
}

export interface JobRequest {
  role: AgentRole;
  resolved: ResolvedRole;
  systemPrompt: string;
  userPrompt: string;
  /** Signals written to the job's scratch dir as `signals.json` (also for the fake provider). */
  signals: Signal[];
  timeoutMs: number;
  /** When true, parse the output as JSON (with one repair retry). */
  wantJson: boolean;
}

export interface JobOutcome<T> {
  text: string;
  data?: T;
  usage?: { inputTokens?: number; outputTokens?: number };
  providerId: string;
}

/**
 * Run one agent job in an isolated scratch dir (never the user's home). On a JSON
 * parse failure, retries exactly once with the parser error appended, per the plan.
 */
export async function runJob<T>(req: JobRequest): Promise<JobOutcome<T>> {
  const dir = mkdtempSync(join(tmpdir(), 'le-job-'));
  writeFileSync(join(dir, 'signals.json'), JSON.stringify(req.signals, null, 2), 'utf8');
  const provider = req.resolved.provider;
  const baseJob: AgentJob = {
    role: req.role,
    systemPrompt: req.systemPrompt,
    userPrompt: req.userPrompt,
    workingDir: dir,
    model: req.resolved.model,
    outputSchema: req.wantJson ? {} : undefined,
    timeoutMs: req.timeoutMs,
  };
  try {
    const first = await runToText(provider, baseJob);
    if (!req.wantJson) {
      return { text: first.output, usage: first.usage, providerId: req.resolved.providerId };
    }
    try {
      return {
        text: first.output,
        data: extractJson<T>(first.output),
        usage: first.usage,
        providerId: req.resolved.providerId,
      };
    } catch (parseErr) {
      const retry = await runToText(provider, {
        ...baseJob,
        userPrompt: `${req.userPrompt}\n\n----- PARSE ERROR -----\nYour previous response could not be parsed as JSON (${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }). Return ONLY a valid JSON object this time.`,
      });
      return {
        text: retry.output,
        data: extractJson<T>(retry.output),
        usage: retry.usage,
        providerId: req.resolved.providerId,
      };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
