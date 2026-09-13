import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt } from './util.js';

/**
 * OpenCode CLI. Verified invocation (docs/providers-research.md, docs/providers.md):
 *   <prompt on stdin> | opencode run --quiet [-m provider/model]
 * The prompt goes on STDIN, never argv (see gemini.ts for why: `cmd.exe /c` on Windows,
 * and the prompt embeds fetched web text). No positional message is passed. The docs page
 * (opencode.ai/docs/cli) does not mention stdin, but the `run` command's source
 * (packages/opencode/src/cli/cmd/run.ts) reads it whenever `!process.stdin.isTTY` and,
 * with no positional message, uses the piped text as the whole message
 * (`resolveRunInput`). `--quiet` is kept from the earlier verified invocation; it is not
 * on the current docs page or in run.ts, so if it starts failing, drop it — do not
 * invent a replacement.
 * `--format json` emits a raw event stream whose field names are UNVERIFIED, so we
 * use plain mode and take stdout as the answer text.
 */
export const opencodeProvider: AgentProvider = {
  id: 'opencode',
  displayName: 'OpenCode',
  maturity: 'untested',
  blurb: 'An open-source agent that can front several different model providers.',
  setup: [
    {
      text: 'Install OpenCode',
      url: 'https://opencode.ai',
      note: 'Its own page has the current instructions. We have not verified them against a live install — if they have changed, that is worth reporting.',
    },
    { text: 'Sign in to whichever provider you want it to use', command: 'opencode auth login' },
  ],
  capabilities: {
    webSearch: false,
    fileAccess: true,
    jsonOutput: false,
    streaming: true,
    // The one agent here whose model names carry a slash, and the reason this hint exists.
    modelSyntax: {
      hint: 'provider/model — the slash matters. For example anthropic/claude-sonnet-4-5.',
      pattern: '^[^/\\s]+/[^/\\s]+$',
      whenWrong:
        'OpenCode needs the provider and the model with a slash between them, like ' +
        'anthropic/claude-sonnet-4-5. A bare model name will not resolve.',
    },
  },

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
    try {
      const { stdout, stderr, code } = await runCli('opencode', args, {
        timeoutMs: job.timeoutMs,
        cwd: job.workingDir,
        input: composePrompt(job),
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
