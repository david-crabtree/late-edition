/**
 * The newsroom role a job is being run for. Affects budgets and prompt selection.
 * `researcher` runs first and is the one role expected to browse the web / use tools —
 * providers can branch on it to enable their native web capability.
 */
export type AgentRole =
  | 'triage'
  | 'researcher'
  | 'reporter'
  | 'writer'
  | 'editor'
  | 'copydesk'
  /** The picture desk: a shot list, caption and alt text. Never an image. */
  | 'photo';

/** What a provider can do, surfaced on the "staff available" screen. */
/**
 * How this agent's model names are written.
 *
 * The model box takes free text and hands whatever is in it straight to the agent's own
 * command line, and every agent wants a different shape: an alias for one, a full id for
 * another, and `provider/model` — slash and all — for OpenCode. Nothing said so, so the
 * only way to find out you were wrong was a failed desk.
 */
export interface ModelSyntax {
  /** One line on the shape, shown under the box. Say it the way you would to a person. */
  hint: string;
  /** A pattern the name must match, where the shape is strict enough to be worth checking. */
  pattern?: string;
  /** What to tell them when it does not match. */
  whenWrong?: string;
}

export interface AgentCapabilities {
  /** Can the agent browse the web on its own? */
  webSearch: boolean;
  /** Can the agent read files in its working dir? */
  fileAccess: boolean;
  /** Does the CLI support a structured JSON output mode? */
  jsonOutput: boolean;
  /** Does the CLI stream tokens as it works? */
  streaming: boolean;
  /** Known model ids, if enumerable. Offered in Setup's model picker; free text still wins. */
  models?: string[];
  /** How this agent's model names are written. Shown under the model box in Setup. */
  modelSyntax?: ModelSyntax;
  /**
   * Which of this provider's models suits each desk, cheap where it's grunt work and strong
   * where judgement matters. Setup shows this as the recommendation, so it has to follow the
   * provider the user picked — a Claude alias next to an Ollama desk is worse than nothing.
   */
  recommend?: Partial<Record<AgentRole, string>>;
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
  /**
   * The models THIS install actually has, where the agent can be asked. Beats the static
   * list in `capabilities.models`, which is a guess written when the file was: Ollama only
   * has the models you pulled, and typing the name of one you did not is a run that fails
   * at the desk after the earlier desks have already spent.
   */
  models?: string[];
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
  | {
      type: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      costUsd?: number;
    }
  | { type: 'done'; output: string }
  | { type: 'error'; error: string };

/**
 * How far a provider has actually been driven. Only `proven` has filed a real edition
 * end to end; `untested` is written and detected but never confirmed against a live CLI.
 * Setup surfaces this rather than presenting every provider as an equal choice.
 */
export type ProviderMaturity = 'proven' | 'untested' | 'internal';

/**
 * One thing a person has to do to make an agent ready.
 *
 * This used to be a line of text telling them what to type, which assumes they know what a
 * terminal is, how to open one, and that "run this" means anything at all. It is the exact
 * point at which someone who is not a developer gives up. A step now says what it is FOR
 * in plain words, and carries whichever of a page or a command it needs, so the app can
 * put the download in front of them or open a terminal sitting at the command.
 */
export interface SetupStep {
  /** What this step gets you, in plain English. Not the command — the point of it. */
  text: string;
  /** A page to open in their browser: a download, a sign-up, documentation. */
  url?: string;
  /** A command to run. The app never takes this from the interface — see `le:openTerminal`. */
  command?: string;
  /** Anything they will want to know before doing it. Shown under the step. */
  note?: string;
}

export interface AgentProvider {
  /** Stable id: "claude" | "codex" | "gemini" | "ollama" | "fake" | ... */
  id: string;
  displayName: string;
  /** Honest status of this integration. Defaults to `untested` where unset. */
  maturity?: ProviderMaturity;
  /** One line on what this agent IS, for somebody who has never heard of it. */
  blurb?: string;
  /** What it takes to make this agent ready, as steps the app can act on. */
  setup?: SetupStep[];
  /**
   * Why the app cannot do any of this one for you. Set it only where that is genuinely
   * true — it is shown to the user as a plain admission, and the honest version of an
   * agent nobody can get working is saying so, not a panel of buttons that do nothing.
   */
  manualOnly?: string;
  /** Is the CLI installed and authenticated? */
  detect(): Promise<Detection>;
  /** Run a job, streaming events. Must always end with a 'done' or 'error'. */
  run(job: AgentJob): AsyncIterable<AgentEvent>;
  capabilities: AgentCapabilities;
}

/** Convenience: drain a provider run to its final text output. */
export interface AgentUsage {
  /** Fresh prompt tokens the model actually had to read. */
  inputTokens?: number;
  outputTokens?: number;
  /**
   * Prompt tokens served from cache. Counted in the headline total because providers count
   * them, but they are the cheap part and they dominate a multi-agent run — a total that
   * doesn't separate them makes a normal edition look extravagant.
   */
  cacheReadTokens?: number;
  /** Prompt tokens written into the cache on this call. */
  cacheWriteTokens?: number;
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
      usage = {
        inputTokens: ev.inputTokens,
        outputTokens: ev.outputTokens,
        cacheReadTokens: ev.cacheReadTokens,
        cacheWriteTokens: ev.cacheWriteTokens,
        costUsd: ev.costUsd,
      };
    else if (ev.type === 'error') throw new Error(`[${provider.id}] ${ev.error}`);
  }
  return { output, usage };
}
