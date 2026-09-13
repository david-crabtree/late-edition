import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt, jsonField } from './util.js';

/**
 * Google Gemini CLI. Verified invocation (docs/providers-research.md, docs/providers.md):
 *   <prompt on stdin> | gemini --output-format json [-m <model>]
 * The prompt goes on STDIN, never argv: on Windows `runCli` launches through `cmd.exe /c`,
 * which mangles quotes, expands `%VAR%` and caps the command line at ~8 KB — and the
 * prompt embeds fetched web/RSS text, so argv would let a hostile source inject a command.
 * Piped stdin is documented: the CLI reference lists `cat logs.txt | gemini`, the headless
 * docs say headless mode "is triggered when the CLI is run in a non-TTY environment", and
 * gemini.tsx reads stdin whenever `!process.stdin.isTTY`. `-p` is therefore not needed
 * (it is documented as "Appended to stdin input if provided") and is deliberately not
 * passed — the material must never ride in argv. The final answer text is in the JSON
 * envelope's `response` field.
 */
export const geminiProvider: AgentProvider = {
  id: 'gemini',
  displayName: 'Gemini CLI',
  maturity: 'untested',
  blurb: 'Google’s command-line agent. Runs on a Google account or a Gemini API key.',
  setup: [
    {
      text: 'Install the Gemini CLI',
      url: 'https://geminicli.com',
      note: 'Its own page has the current instructions. We have not verified them against a live install — if they have changed, that is worth reporting.',
    },
    {
      text: 'Sign in, so it can talk to Google on your behalf',
      command: 'gemini',
      note: 'Running it once walks you through signing in. Type /quit when that is done.',
    },
  ],
  capabilities: {
    webSearch: true,
    fileAccess: true,
    jsonOutput: true,
    streaming: true,
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    modelSyntax: {
      hint: 'A model name on its own, e.g. gemini-2.5-pro. Blank takes its default.',
    },
    recommend: {
      triage: 'gemini-2.5-flash',
      researcher: 'gemini-2.5-flash',
      reporter: 'gemini-2.5-pro',
      writer: 'gemini-2.5-pro',
      editor: 'gemini-2.5-pro',
      copydesk: 'gemini-2.5-flash',
      photo: 'gemini-2.5-flash',
    },
  },

  async detect(): Promise<Detection> {
    const p = await probe('gemini', ['--version']);
    if (!p.installed) {
      return {
        installed: false,
        authenticated: false,
        detail:
          'Install the Gemini CLI: https://geminicli.com — then set GEMINI_API_KEY or log in.',
      };
    }
    return {
      installed: true,
      authenticated: true,
      version: p.stdout || undefined,
      detail: 'Auth is managed by the Gemini CLI (API key or login).',
    };
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    yield { type: 'start', provider: 'gemini', model: job.model };
    const args = ['--output-format', 'json'];
    if (job.model) args.push('-m', job.model);
    try {
      const { stdout, stderr, code } = await runCli('gemini', args, {
        timeoutMs: job.timeoutMs,
        input: composePrompt(job),
      });
      const text = jsonField(stdout, 'response') ?? stdout.trim();
      if (!text) {
        yield {
          type: 'error',
          error: `gemini returned no output (exit ${code}). ${stderr}`.trim(),
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
            ? 'Gemini CLI (`gemini`) is not installed.'
            : err instanceof Error
              ? err.message
              : String(err),
      };
    }
  },
};
