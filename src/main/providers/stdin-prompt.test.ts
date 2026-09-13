import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentJob } from './types.js';

/**
 * The prompt goes on stdin. Never argv.
 *
 * On Windows `runCli` launches every CLI through `cmd.exe /c`, and the prompt embeds text
 * fetched from the web and from RSS feeds — so a prompt in argv is a command-injection
 * route for any source we read, a `%VAR%` expansion, and an ~8 KB truncation of every real
 * job. Claude Code got this right from the start; the other three did not. This intercepts
 * `runCli` and checks, for each of them, that the material arrives in `opts.input` and
 * that no argument so much as contains it.
 */

const calls: { cmd: string; args: string[]; opts: { input?: string } }[] = [];

vi.mock('./cli.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./cli.js')>();
  return {
    ...real,
    runCli: vi.fn(async (cmd: string, args: string[], opts: { input?: string }) => {
      calls.push({ cmd, args, opts });
      return { stdout: '{"response":"ok","result":"ok"}', stderr: '', code: 0 };
    }),
  };
});

// Everything cmd.exe would love to get its hands on, plus enough to blow the 8 KB line.
const HOSTILE = [
  'Breaking: "quoted" & piped | ^caret %PATH% %USERPROFILE% ',
  '&& del /q C:\\Windows\\System32\\* ; $(rm -rf /) `whoami`\n\n',
  'x'.repeat(10_000),
].join('');

const job: AgentJob = {
  role: 'reporter',
  systemPrompt: 'You are on the desk.',
  userPrompt: HOSTILE,
  workingDir: 'H:/nowhere',
  model: 'some-model',
  timeoutMs: 1000,
};

const providers = async () => [
  (await import('./claude.js')).claudeProvider,
  (await import('./codex.js')).codexProvider,
  (await import('./gemini.js')).geminiProvider,
  (await import('./opencode.js')).opencodeProvider,
];

describe('the prompt reaches every CLI on stdin', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it.each(['claude', 'codex', 'gemini', 'opencode'])('%s', async (id) => {
    const provider = (await providers()).find((p) => p.id === id);
    if (!provider) throw new Error(`no provider ${id}`);
    for await (const _ of provider.run(job)) {
      // drain
    }
    const call = calls.find((c) => c.cmd === id);
    expect(call, `${id} never ran its CLI`).toBeTruthy();
    if (!call) return;

    // The whole composed prompt, system guidance and materials, on stdin.
    expect(call.opts.input).toContain(job.systemPrompt);
    expect(call.opts.input).toContain(HOSTILE);

    // And not one argument that carries any of it — not the material, not even the
    // system prompt. Everything in argv is a flag, a value we chose, or a path.
    for (const arg of call.args) {
      expect(arg, `${id} put the material in argv`).not.toContain('Breaking:');
      expect(arg, `${id} put the system prompt in argv`).not.toContain('You are on the desk');
      expect(arg.length, `${id} has an argument long enough to be the prompt`).toBeLessThan(1000);
    }

    // The model flag survived the move.
    expect(call.args).toContain('some-model');
  });

  it('codex asks for the prompt with the lone `-` sentinel', async () => {
    const codex = (await providers()).find((p) => p.id === 'codex');
    if (!codex) throw new Error('no codex');
    for await (const _ of codex.run(job)) {
      // drain
    }
    const call = calls.find((c) => c.cmd === 'codex');
    expect(call?.args.at(-1)).toBe('-');
  });

  it('gemini passes no -p at all, so nothing is appended to the material', async () => {
    const gemini = (await providers()).find((p) => p.id === 'gemini');
    if (!gemini) throw new Error('no gemini');
    for await (const _ of gemini.run(job)) {
      // drain
    }
    const call = calls.find((c) => c.cmd === 'gemini');
    expect(call?.args).not.toContain('-p');
    expect(call?.args).toEqual(['--output-format', 'json', '-m', 'some-model']);
  });

  it('opencode passes no positional message', async () => {
    const oc = (await providers()).find((p) => p.id === 'opencode');
    if (!oc) throw new Error('no opencode');
    for await (const _ of oc.run(job)) {
      // drain
    }
    const call = calls.find((c) => c.cmd === 'opencode');
    expect(call?.args).toEqual(['run', '--quiet', '-m', 'some-model']);
  });
});
