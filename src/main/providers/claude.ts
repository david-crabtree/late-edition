import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, AgentUsage, Detection } from './types.js';
import { composePrompt, jsonField } from './util.js';

/** Web tools handed to a researcher job (verified names from `claude --help`). */
const RESEARCH_TOOLS = ['WebSearch', 'WebFetch'];

/** Pull token usage and the CLI-reported USD cost out of the Claude Code JSON envelope. */
function parseUsage(stdout: string): AgentUsage | undefined {
  try {
    const obj = JSON.parse(stdout) as { usage?: Record<string, unknown>; total_cost_usd?: unknown };
    const u = obj.usage ?? {};
    // Kept apart on purpose. Cache reads are most of a multi-agent run's headline number
    // and are the cheap part; folding them into "input" makes a routine edition look wild.
    const inputTokens = Number(u.input_tokens) || 0;
    const cacheReadTokens = Number(u.cache_read_input_tokens) || 0;
    const cacheWriteTokens = Number(u.cache_creation_input_tokens) || 0;
    const outputTokens = Number(u.output_tokens) || 0;
    const costUsd = Number(obj.total_cost_usd) || undefined;
    const any = inputTokens || outputTokens || cacheReadTokens || cacheWriteTokens;
    if (!any && costUsd === undefined) return undefined;
    return {
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      cacheReadTokens: cacheReadTokens || undefined,
      cacheWriteTokens: cacheWriteTokens || undefined,
      costUsd,
    };
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
  maturity: 'proven',
  blurb:
    'Anthropic’s own command-line agent, and the one desk of this newsroom proven end to ' +
    'end. Needs a Claude Pro, Max, Team or Console account — the free plan does not ' +
    'include Claude Code.',
  setup: [
    {
      text: 'Install Claude Code — one command, it is not a download',
      commands: {
        darwin: 'curl -fsSL https://claude.ai/install.sh | bash',
        linux: 'curl -fsSL https://claude.ai/install.sh | bash',
        win32:
          'curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd',
      },
      url: 'https://code.claude.com/docs/en/setup',
      note: 'There is no installer to download — this command fetches and installs it. On a Mac, `brew install --cask claude-code` works too if you use Homebrew. The page is the full instructions, including Windows PowerShell and Linux package managers.',
    },
    {
      text: 'Sign in, so it can talk to Anthropic on your behalf',
      command: 'claude auth login',
      note: 'Opens your browser. Signing in to claude.ai on its own does nothing for this — the CLI keeps its own login, and Late Edition never sees either.',
    },
    {
      text: 'Check it answers',
      command: 'claude --version',
      note: 'A version number means you are done. Press Recheck below.',
    },
  ],
  capabilities: {
    webSearch: true,
    fileAccess: true,
    jsonOutput: true,
    streaming: true,
    models: ['haiku', 'sonnet', 'opus'],
    modelSyntax: {
      hint: 'An alias — haiku, sonnet or opus — or a full model id. Blank takes its default.',
    },
    // Cheap on the token-hungry and the mechanical desks, strong where the call is made.
    recommend: {
      triage: 'sonnet',
      researcher: 'haiku',
      reporter: 'sonnet',
      writer: 'sonnet',
      editor: 'opus',
      copydesk: 'haiku',
      photo: 'haiku',
    },
  },

  async detect(): Promise<Detection> {
    const p = await probe('claude', ['--version']);
    if (!p.installed) {
      return {
        installed: false,
        authenticated: false,
        detail: 'Install Claude Code: https://code.claude.com — then `claude auth login`.',
      };
    }
    // `claude auth status` (JSON) tells us both whether we're logged in and *how*: a
    // claude.ai login means usage draws on the subscription plan, not metered API spend.
    let authenticated = true;
    let billing: Detection['billing'] = 'unknown';
    let detail = 'Auth is managed by the Claude Code CLI.';
    try {
      const { stdout } = await runCli('claude', ['auth', 'status'], { timeoutMs: 8000 });
      const j = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string };
      authenticated = j.loggedIn === true;
      if (/claude\.ai|oauth|subscription|console/i.test(String(j.authMethod ?? ''))) {
        billing = 'subscription';
        detail =
          'Logged in via your Claude plan — runs use your subscription usage, not API billing.';
      } else if (authenticated) {
        billing = 'api';
        detail = `Authenticated via ${j.authMethod ?? 'an API key'} — ⚠️ runs are metered API spend.`;
      } else {
        detail = 'Installed but not logged in. Run `claude auth login`.';
      }
    } catch {
      // Couldn't read auth status; report installed with unknown billing rather than fail.
    }
    return { installed: true, authenticated, version: p.stdout || undefined, billing, detail };
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
