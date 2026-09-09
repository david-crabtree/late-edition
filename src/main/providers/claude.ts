import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt, jsonField } from './util.js';

/**
 * Anthropic Claude Code CLI. Verified invocation (docs/providers-research.md):
 *   claude -p "<prompt>" --output-format json [--model <alias|id>]
 * The final answer text is in the JSON envelope's `result` field.
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
    const args = ['-p', composePrompt(job), '--output-format', 'json'];
    if (job.model) args.push('--model', job.model);
    try {
      const { stdout, stderr, code } = await runCli('claude', args, { timeoutMs: job.timeoutMs });
      const text = jsonField(stdout, 'result') ?? stdout.trim();
      if (!text) {
        yield {
          type: 'error',
          error: `claude returned no output (exit ${code}). ${stderr}`.trim(),
        };
        return;
      }
      yield { type: 'text', text };
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
