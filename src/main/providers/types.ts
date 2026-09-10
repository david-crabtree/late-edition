/**
 * The newsroom role a job is being run for. Affects budgets and prompt selection.
 * `researcher` runs first and is the one role expected to browse the web / use tools —
 * providers can branch on it to enable their native web capability.
 */
export type AgentRole = 'triage' | 'researcher' | 'reporter' | 'writer' | 'editor' | 'copydesk';

/** What a provider can do, surfaced on the "staff available" screen. */
export interface AgentCapabilities {
  /** Can the agent browse the web on its own? */
  webSearch: boolean;
  /** Can the agent read files in its working dir? */
  fileAccess: boolean;
  /** Does the CLI support a structured JSON output mode? */
  jsonOutput: boolean;
  /** Does the CLI stream tokens as it works? */
  streaming: boolean;
  /** Known model ids, if enumerable. */
  models?: string[];
}

/**
 * How a provider's usage is paid for — the difference between "counts against my plan
 * allowance" and "costs real money per call". This drives whether the app reassures the
 * user (subscription/local) or warns them hard (metered API spend).
 *   subscription — a logged-in plan (Claude/ChatGPT/etc.): usage draws on the plan's
 *                  allowance/limits, NOT billed per token. Any USD figure is notional.
 *   api          — a metered API key: every call is real money. Warn loudly.
 *   free         — local or offline (ollama, the fake provider): no cost at all.
 *   unknown      — couldn't tell.
 */
export type BillingMode = 'subscription' | 'api' | 'free' | 'unknown';

/** Result of probing whether a provider is usable on this machine. */
export interface Detection {
  installed: boolean;
  authenticated: boolean;
  /** Version string if we could read one. */
  version?: string;
  /** Human-readable reason when unavailable, and/or install guidance. */
  detail?: string;
  /** How usage is paid for — see {@link BillingMode}. */
  billing?: BillingMode;
}

/** A unit of work handed to a provider. */
export interface AgentJob {
  role: AgentRole;
  systemPrompt: string;
  userPrompt: string;
  /** A scratch dir containing only the materials for this job. */
  workingDir: string;
  /** Requested model id; providers map or ignore. */
  model?: string;
  /** When set, we need output matching this JSON shape. */
  outputSchema?: unknown;
  timeoutMs: number;
  budget?: { maxTokens?: number };
}

/** Streaming events emitted while a job runs. */
export type AgentEvent =
  | { type: 'start'; provider: string; model?: string }
  | { type: 'text'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'done'; output: string }
  | { type: 'error'; error: string };

export interface AgentProvider {
  /** Stable id: "claude" | "codex" | "gemini" | "ollama" | "fake" | ... */
  id: string;
  displayName: string;
  /** Is the CLI installed and authenticated? */
  detect(): Promise<Detection>;
  /** Run a job, streaming events. Must always end with a 'done' or 'error'. */
  run(job: AgentJob): AsyncIterable<AgentEvent>;
  capabilities: AgentCapabilities;
}

/** Convenience: drain a provider run to its final text output. */
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Provider-reported cost of the call in USD, when the CLI surfaces it. */
  costUsd?: number;
}

export async function runToText(
  provider: AgentProvider,
  job: AgentJob,
): Promise<{ output: string; usage?: AgentUsage }> {
  let output = '';
  let usage: AgentUsage | undefined;
  for await (const ev of provider.run(job)) {
    if (ev.type === 'done') output = ev.output;
    else if (ev.type === 'usage')
      usage = { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, costUsd: ev.costUsd };
    else if (ev.type === 'error') throw new Error(`[${provider.id}] ${ev.error}`);
  }
  return { output, usage };
}
