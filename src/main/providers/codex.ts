import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt } from './util.js';

/**
 * OpenAI Codex CLI. Verified invocation (docs/providers-research.md, docs/providers.md):
 *   <prompt on stdin> | codex exec --sandbox read-only --ask-for-approval never \
 *     --output-last-message <file> [-m <model>] -
 * The prompt goes on STDIN, never argv (see gemini.ts for why: `cmd.exe /c` on Windows,
 * and the prompt embeds fetched web text). The lone `-` is Codex's documented stdin
 * sentinel — the non-interactive docs show `cat prompt.txt | codex exec -`, and the
 * clap definition in codex-rs/exec/src/cli.rs reads "If not provided as an argument (or
 * if `-` is used), instructions are read from stdin."
 * There is no single JSON result envelope, so we read the final assistant message
 * from the file written by --output-last-message. Read-only sandbox keeps the
 * agent from touching the filesystem — it only needs to produce text.
 */
export const codexProvider: AgentProvider = {
  id: 'codex',
  displayName: 'Codex CLI',
  maturity: 'untested',
  blurb: 'OpenAI’s command-line agent. Runs on a ChatGPT plan or an OpenAI API key.',
  setup: [
    {
      text: 'Install the Codex CLI',
      url: 'https://developers.openai.com/codex',
      note: 'Its own page has the current instructions. We have not verified them against a live install — if they have changed, that is worth reporting.',
    },
    {
      text: 'Sign in, so it can talk to OpenAI on your behalf',
      command: 'codex login',
      note: 'Opens your browser. The login stays inside Codex — Late Edition never sees it.',
    },
  ],
  capabilities: {
    webSearch: false,
    fileAccess: true,
    jsonOutput: false,
    streaming: true,
    models: ['gpt-5-codex', 'gpt-5', 'gpt-5-mini'],
    modelSyntax: { hint: 'A model name on its own, e.g. gpt-5. Blank takes its default.' },
    recommend: {
      triage: 'gpt-5-mini',
      researcher: 'gpt-5-mini',
      reporter: 'gpt-5',
      writer: 'gpt-5',
      editor: 'gpt-5',
      copydesk: 'gpt-5-mini',
      photo: 'gpt-5-mini',
    },
  },

  async detect(): Promise<Detection> {
    const p = await probe('codex', ['--version']);
    if (!p.installed) {
      return {
        installed: false,
        authenticated: false,
        detail: 'Install the Codex CLI: https://developers.openai.com/codex — then `codex login`.',
      };
    }
    return {
      installed: true,
      authenticated: true,
      version: p.stdout || undefined,
      detail: 'Auth is managed by the Codex CLI (`codex login`).',
    };
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    yield { type: 'start', provider: 'codex', model: job.model };
    const dir = mkdtempSync(join(tmpdir(), 'le-codex-'));
    const outFile = join(dir, 'last-message.txt');
    const args = [
      'exec',
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never',
      '--output-last-message',
      outFile,
    ];
    if (job.model) args.push('-m', job.model);
    // `-` in the prompt position: read the prompt from stdin.
    args.push('-');

    try {
      const { stdout, stderr, code } = await runCli('codex', args, {
        timeoutMs: job.timeoutMs,
        cwd: job.workingDir,
        input: composePrompt(job),
      });
      let text = '';
      try {
        text = readFileSync(outFile, 'utf8').trim();
      } catch {
        text = stdout.trim();
      }
      if (!text) {
        yield { type: 'error', error: `codex returned no output (exit ${code}). ${stderr}`.trim() };
        return;
      }
      yield { type: 'text', text };
      yield { type: 'done', output: text };
    } catch (err) {
      yield {
        type: 'error',
        error:
          err instanceof CliNotInstalledError
            ? 'Codex CLI (`codex`) is not installed.'
            : err instanceof Error
              ? err.message
              : String(err),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
