import type { AgentJob } from './types.js';

/**
 * Compose a single prompt string from a job. We use one universal mechanism —
 * system guidance followed by the user materials — because not every CLI exposes
 * a separate system-prompt flag, and inventing flags is against policy.
 */
export function composePrompt(job: AgentJob): string {
  return `${job.systemPrompt.trim()}\n\n----- MATERIALS -----\n\n${job.userPrompt.trim()}`;
}

/** Pull a string field out of a JSON envelope, tolerating parse failure. */
export function jsonField(stdout: string, field: string): string | undefined {
  try {
    const obj = JSON.parse(stdout) as Record<string, unknown>;
    const v = obj[field];
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}
