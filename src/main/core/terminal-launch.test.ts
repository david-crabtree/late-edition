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
const PLATFORMS: NodeJS.Platform[] = ['darwin', 'win32', 'linux'];

/** Every command any provider ships, resolved the way the app resolves it per platform. */
const commandsFor = (platform: NodeJS.Platform) =>
  listProviders()
    .filter((p) => p.maturity !== 'internal')
    .flatMap((p) =>
      (p.setup ?? [])
        .map((s) => [p.id, s.commands?.[platform] ?? s.command] as const)
        .filter((pair): pair is readonly [string, string] => !!pair[1])
        .map(([id, command]) => [id, command] as [string, string]),
    );

const COMMANDS = commandsFor('darwin');

describe('opening a terminal at a setup command', () => {
  it('has commands to test, on every platform, from more than one provider', () => {
    for (const platform of PLATFORMS) {
      const found = commandsFor(platform);
      expect(found.length, platform).toBeGreaterThan(4);
      expect(new Set(found.map(([id]) => id)).size, platform).toBeGreaterThan(2);
    }
  });

  // The install commands are the ones that differ, and the ones a pipe or a redirect could
  // break. Claude Code's macOS installer pipes curl into bash; Windows redirects to a file.
  it('resolves a different install command per platform where there is one', () => {
    const claudeInstall = (p: NodeJS.Platform) =>
      commandsFor(p).find(([id, c]) => id === 'claude' && c.includes('install'))?.[1];
    expect(claudeInstall('darwin')).toContain('install.sh');
    expect(claudeInstall('win32')).toContain('install.cmd');
    expect(claudeInstall('darwin')).not.toBe(claudeInstall('win32'));
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

  // Install commands differ by platform, so Windows is checked against its own.
  it.each(commandsFor('win32'))('%s: "%s" survives Windows', (_id, command) => {
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

  it.each(commandsFor('linux'))('%s: "%s" survives Linux', (_id, command) => {
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
