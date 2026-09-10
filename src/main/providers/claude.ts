import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt, jsonField } from './util.js';

/** Web tools handed to a researcher job (verified names from `claude --help`). */
const RESEARCH_TOOLS = ['WebSearch', 'WebFetch'];

/** Pull `{ inputTokens, outputTokens }` out of the Claude Code JSON envelope's `usage`. */
function parseUsage(stdout: string): { inputTokens?: number; outputTokens?: number } | undefined {
  try {
    const obj = JSON.parse(stdout) as { usage?: Record<string, unknown> };
    const u = obj.usage;
    if (!u) return undefined;
    const inputTokens =
      (Number(u.input_tokens) || 0) +
      (Number(u.cache_read_input_tokens) || 0) +
      (Number(u.cache_creation_input_tokens) || 0);
    const outputTokens = Number(u.output_tokens) || 0;
    return { inputTokens: inputTokens || undefined, outputTokens: outputTokens || undefined };
  } catch {
    return undefined;
  }
}

/**
 * Anthropic Claude Code CLI. Verified invocation (docs/providers-research.md + `claude --help`):
 *   claude -p --output-format json [--model <alias|id>] [--allowed-tools <tools...>]
 * The prompt is fed on STDIN (works with `-p`, avoids the Windows argv length limit), and
 * the final answer text is in the JSON envelope's `result` field. A `researcher` job gets
 * WebSearch/WebFetch so it can actually browse; every other role runs tool-free (pure
 * synthesis), which is cheaper and safer.
 */
export const claudeProvider: AgentProvider = {
  id: 'claude',
  displayName: 'Claude Code',
  capabilities: { webSearch: true, fileAccess: true, jsonOutput: true, streaming: true },

  async detect(): Promise<Detection> {
    const p = await probe('claude', ['--version']);
    if (!p.installed) {
      return {
        installed: false,
        authenticated: false,
        detail: 'Install Claude Code: https://code.claude.com — then `claude auth login`.',
      };
    }
    return {
      installed: true,
      authenticated: true,
      version: p.stdout || undefined,
      detail: 'Auth is managed by the Claude Code CLI.',
    };
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    yield { type: 'start', provider: 'claude', model: job.model };
    const args = ['-p', '--output-format', 'json'];
    if (job.model) args.push('--model', job.model);
    if (job.role === 'researcher') args.push('--allowed-tools', ...RESEARCH_TOOLS);
    try {
      const { stdout, stderr, code } = await runCli('claude', args, {
        timeoutMs: job.timeoutMs,
        input: composePrompt(job),
      });
      const text = jsonField(stdout, 'result') ?? stdout.trim();
      if (!text) {
        yield {
          type: 'error',
          error: `claude returned no output (exit ${code}). ${stderr}`.trim(),
        };
        return;
      }
      yield { type: 'text', text };
      const usage = parseUsage(stdout);
      if (usage) yield { type: 'usage', ...usage };
      yield { type: 'done', output: text };
    } catch (err) {
      yield {
        type: 'error',
        error:
          err instanceof CliNotInstalledError
            ? 'Claude Code CLI (`claude`) is not installed.'
            : err instanceof Error
              ? err.message
              : String(err),
      };
    }
  },
};
