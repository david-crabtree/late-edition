import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt, jsonField } from './util.js';

/**
 * Google Gemini CLI. Verified invocation (docs/providers-research.md):
 *   gemini -p "<prompt>" --output-format json [-m <model>]
 * The final answer text is in the JSON envelope's `response` field.
 */
export const geminiProvider: AgentProvider = {
  id: 'gemini',
  displayName: 'Gemini CLI',
  maturity: 'untested',
  blurb: 'Google’s command-line agent. Runs on a Google account or a Gemini API key.',
  setup: [
    { text: 'Install the Gemini CLI', url: 'https://geminicli.com' },
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
    const args = ['-p', composePrompt(job), '--output-format', 'json'];
    if (job.model) args.push('-m', job.model);
    try {
      const { stdout, stderr, code } = await runCli('gemini', args, { timeoutMs: job.timeoutMs });
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
