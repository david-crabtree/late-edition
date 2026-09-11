import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { listProviders } from '../providers/registry.js';
import { LINUX_TERMINALS, terminalLaunch } from './terminal-launch.js';

/**
 * Every setup command, on every platform, from a directory with a space in it.
 *
 * The bug was one unquoted path on macOS and it broke every provider identically, because
 * they all come through one handler. Asserting that for one of them would prove nothing —
 * so this walks the real provider list and checks the lot.
 */

/** The path that actually broke: the default newsroom on macOS. */
const SPACEY = '/Users/davidcrabtree/Library/Application Support/late-edition/newsroom';

/** Every command any provider ships, taken from the providers themselves. */
const COMMANDS = listProviders()
  .filter((p) => p.maturity !== 'internal')
  .flatMap((p) => (p.setup ?? []).filter((s) => s.command).map((s) => [p.id, s.command as string]));

describe('opening a terminal at a setup command', () => {
  it('has commands to test, from more than one provider', () => {
    expect(COMMANDS.length).toBeGreaterThan(4);
    expect(new Set(COMMANDS.map(([id]) => id)).size).toBeGreaterThan(2);
  });

  it.each(COMMANDS)('%s: "%s" survives macOS', (_id, command) => {
    const { attempts, cwd } = terminalLaunch('darwin', SPACEY, command);
    const script = attempts[0]?.args[1] ?? '';
    // The directory is written into the command, not passed to spawn.
    expect(cwd).toBeUndefined();
    expect(script).toContain(command);
    // Quoted as one argument. Unquoted, cd stopped at ".../Library/Application".
    expect(script).toContain(`cd '${SPACEY}'`);
    expect(script).not.toContain(`cd ${SPACEY}`);
  });

  it.each(COMMANDS)('%s: "%s" survives Windows', (_id, command) => {
    const { attempts, cwd } = terminalLaunch(
      'win32',
      'C:\\Users\\demo\\App Data\\newsroom',
      command,
    );
    // Windows passes the directory to spawn, where it needs no quoting at all, and the
    // command is its own argv entry rather than part of a string.
    expect(cwd).toBe('C:\\Users\\demo\\App Data\\newsroom');
    expect(attempts[0]?.args).toContain(command);
  });

  it.each(COMMANDS)('%s: "%s" survives Linux', (_id, command) => {
    const { attempts, cwd } = terminalLaunch('linux', SPACEY, command);
    expect(cwd).toBe(SPACEY);
    expect(attempts).toHaveLength(LINUX_TERMINALS.length);
    for (const a of attempts) expect(a.args.at(-1)).toBe(`${command}; exec bash`);
  });

  // The macOS script is the only one assembled by hand, so it is the only one where the
  // quoting can be wrong. Hand it to a real shell and see what the cd actually receives.
  it.skipIf(process.platform === 'win32')('the macOS cd lands in the right directory', () => {
    const { attempts } = terminalLaunch('darwin', SPACEY, 'claude auth login');
    // Unescape the AppleScript layer to get back the shell command Terminal would run.
    const shell = String(attempts[0]?.args[1])
      .replace(/^tell application "Terminal" to do script "/, '')
      .replace(/"$/, '')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    const cdOnly = shell.split(' && ')[0] ?? '';
    const out = execFileSync('sh', ['-c', `printf %s ${cdOnly.replace(/^cd /, '')}`], {
      encoding: 'utf8',
    });
    expect(out).toBe(SPACEY);
  });
});
