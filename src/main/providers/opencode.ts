import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt } from './util.js';

/**
 * OpenCode CLI. Verified invocation (docs/providers-research.md):
 *   opencode run [-m provider/model] "<prompt>"
 * `--format json` emits a raw event stream whose field names are UNVERIFIED, so we
 * use plain mode and take stdout as the answer text.
 */
export const opencodeProvider: AgentProvider = {
  id: 'opencode',
  displayName: 'OpenCode',
  maturity: 'untested',
  setupSteps: ['Install OpenCode from https://opencode.ai', 'opencode auth login'],
  capabilities: { webSearch: false, fileAccess: true, jsonOutput: false, streaming: true },

  async detect(): Promise<Detection> {
    const p = await probe('opencode', ['--version']);
    if (!p.installed) {
      return {
        installed: false,
        authenticated: false,
        detail: 'Install OpenCode: https://opencode.ai — then `opencode auth`.',
      };
    }
    return {
      installed: true,
      authenticated: true,
      version: p.stdout || undefined,
      detail: 'Auth is managed by OpenCode (`opencode auth`).',
    };
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    yield { type: 'start', provider: 'opencode', model: job.model };
    const args = ['run', '--quiet'];
    if (job.model) args.push('-m', job.model);
    args.push(composePrompt(job));
    try {
      const { stdout, stderr, code } = await runCli('opencode', args, {
        timeoutMs: job.timeoutMs,
        cwd: job.workingDir,
      });
      const text = stdout.trim();
      if (!text) {
        yield {
          type: 'error',
          error: `opencode returned no output (exit ${code}). ${stderr}`.trim(),
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
            ? 'OpenCode (`opencode`) is not installed.'
            : err instanceof Error
              ? err.message
              : String(err),
      };
    }
  },
};
