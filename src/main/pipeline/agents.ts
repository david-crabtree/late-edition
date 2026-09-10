import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Newsroom, RoleAssignment } from '../config/types.js';
import type { Signal } from '../core/signal.js';
import { getProvider } from '../providers/registry.js';
import type { AgentJob, AgentProvider, AgentRole, AgentUsage } from '../providers/types.js';
import { extractJson } from './json.js';
import { StaffNotConfiguredError, isUnstaffed } from './staffing.js';

export interface ResolvedRole {
  providerId: string;
  model?: string;
  provider: AgentProvider;
}

function resolve(assignment: RoleAssignment, force?: string, deskLabel?: string): ResolvedRole {
  const providerId = force ?? assignment.provider;
  // An empty desk stops the edition rather than quietly falling back to invented copy.
  if (isUnstaffed(providerId)) {
    throw new StaffNotConfiguredError(deskLabel ?? 'desk', deskLabel ?? 'desk');
  }
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
  return resolve(newsroom.staff.managingEditor, force, 'the editor’s desk');
}

export function resolveResearcher(
  newsroom: Newsroom,
  beatId: string,
  force?: string,
): ResolvedRole {
  return resolve(
    newsroom.staff.researchers[beatId] ?? newsroom.staff.researchers.default,
    force,
    'research desk',
  );
}

export function resolveReporter(newsroom: Newsroom, beatId: string, force?: string): ResolvedRole {
  return resolve(
    newsroom.staff.reporters[beatId] ?? newsroom.staff.reporters.default,
    force,
    'reporters’ desk',
  );
}

export function resolveWriter(newsroom: Newsroom, beatId: string, force?: string): ResolvedRole {
  return resolve(
    newsroom.staff.writers[beatId] ?? newsroom.staff.writers.default,
    force,
    'copywriters’ desk',
  );
}

export function resolveCopyDesk(newsroom: Newsroom, force?: string): ResolvedRole {
  return resolve(newsroom.staff.copyDesk, force, 'copy desk');
}

/** Distinct provider ids configured across all desks, a given id first. */
function staffProviderIds(newsroom: Newsroom, first: string): string[] {
  const s = newsroom.staff;
  const all = [
    s.managingEditor.provider,
    ...Object.values(s.reporters).map((r) => r.provider),
    ...Object.values(s.writers).map((r) => r.provider),
    s.copyDesk.provider,
  ];
  return [first, ...all.filter((id) => id !== first && !isUnstaffed(id))].filter(
    (id, i, arr) => arr.indexOf(id) === i,
  );
}

export interface ReporterPoolOptions {
  /** How many independent angles to commission (1-3). */
  count: number;
  /** Prefer different providers across the angles. */
  mixProviders: boolean;
  force?: string;
}

/**
 * Resolve the desk(s) that will file on one story. With `count` > 1 this returns
 * several reporters; when `mixProviders` is set and the newsroom has more than one
 * provider configured, they come from different providers (which disagree in useful
 * ways). A forced provider can't be mixed, so it's repeated — real models still
 * diverge across calls, and each reporter gets a distinct angle directive.
 */
export function resolveReporterPool(
  newsroom: Newsroom,
  beatId: string,
  opts: ReporterPoolOptions,
): ResolvedRole[] {
  const base = resolveReporter(newsroom, beatId, opts.force);
  const count = Math.max(1, Math.min(opts.count, 3));
  if (count === 1 || opts.force || !opts.mixProviders) {
    return Array.from({ length: count }, () => base);
  }
  const ids = staffProviderIds(newsroom, base.providerId);
  return Array.from({ length: count }, (_, i) => {
    const id = ids[i % ids.length] as string;
    return id === base.providerId ? base : resolve({ provider: id }, undefined, 'reporters’ desk');
  });
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
  /**
   * Optional sink for the agent's output as it arrives. Providers stream text while they
   * work; without this it was collected and thrown away, so the per-desk console had
   * nothing to show but stage transitions.
   */
  onText?: (chunk: string) => void;
}

export interface JobOutcome<T> {
  text: string;
  data?: T;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  providerId: string;
  /** Which model actually took the desk — blank means the provider's own default. */
  model?: string;
}

/**
 * Drain a provider run, passing every text chunk to `onText` on the way past. This is
 * `runToText` plus a tap — the tap is what lets the app show an agent working rather than
 * just report that it finished.
 */
async function runStreaming(
  provider: AgentProvider,
  job: AgentJob,
  onText?: (chunk: string) => void,
): Promise<{ output: string; usage?: AgentUsage }> {
  let output = '';
  let usage: AgentUsage | undefined;
  for await (const ev of provider.run(job)) {
    if (ev.type === 'text') {
      if (onText && ev.text) onText(ev.text);
    } else if (ev.type === 'done') output = ev.output;
    else if (ev.type === 'usage')
      usage = { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, costUsd: ev.costUsd };
    else if (ev.type === 'error') throw new Error(`[${provider.id}] ${ev.error}`);
  }
  return { output, usage };
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
    const first = await runStreaming(provider, baseJob, req.onText);
    if (!req.wantJson) {
      return {
        text: first.output,
        usage: first.usage,
        providerId: req.resolved.providerId,
        model: req.resolved.model,
      };
    }
    try {
      return {
        text: first.output,
        data: extractJson<T>(first.output),
        usage: first.usage,
        providerId: req.resolved.providerId,
        model: req.resolved.model,
      };
    } catch (parseErr) {
      req.onText?.('\n[unreadable JSON came back — asking the desk again]\n');
      const retry = await runStreaming(
        provider,
        {
          ...baseJob,
          userPrompt: `${req.userPrompt}\n\n----- PARSE ERROR -----\nYour previous response could not be parsed as JSON (${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }). Return ONLY a valid JSON object this time.`,
        },
        req.onText,
      );
      return {
        text: retry.output,
        data: extractJson<T>(retry.output),
        usage: retry.usage,
        providerId: req.resolved.providerId,
        model: req.resolved.model,
      };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
