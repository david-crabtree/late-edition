import { shellQuote } from './shell-quote.js';

/**
 * How to open a terminal sitting at a command, on each platform.
 *
 * Split out of the Electron handler so it can be tested from anywhere, against every
 * command every provider actually ships, rather than only on whichever machine happens to
 * be running. The bug that prompted this was a working directory with a space in it —
 * `~/Library/Application Support` — written unquoted into a command string, which zsh read
 * as two arguments. It failed identically for every provider, because they all come
 * through here.
 */

export interface TerminalAttempt {
  file: string;
  args: string[];
}

export interface TerminalLaunch {
  /** Programs to try in order. Only Linux needs more than one. */
  attempts: TerminalAttempt[];
  /**
   * Passed to `spawn`. Undefined on macOS, where Terminal.app starts its own shell and the
   * directory has to be written into the command text instead.
   */
  cwd?: string;
}

/** Terminals to try on Linux, where no single one is guaranteed to exist. */
export const LINUX_TERMINALS = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'];

export function terminalLaunch(
  platform: NodeJS.Platform,
  cwd: string,
  command: string,
): TerminalLaunch {
  if (platform === 'win32') {
    // `start` takes a window title first, or it swallows the next quoted argument as one.
    // /k keeps the window open afterwards so the output can be read. The directory goes
    // through spawn, where it needs no quoting whatever it contains.
    return {
      cwd,
      attempts: [
        { file: 'cmd.exe', args: ['/c', 'start', 'Late Edition setup', 'cmd.exe', '/k', command] },
      ],
    };
  }

  if (platform === 'darwin') {
    // Terminal.app starts its own shell, so the directory has to be written into the
    // command — quoted, or a path like "Library/Application Support" ends the cd early.
    // The result is then escaped again for the AppleScript string that carries it.
    const script = `cd ${shellQuote(cwd)} && ${command}`;
    const escaped = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return {
      attempts: [
        {
          file: 'osascript',
          args: [
            '-e',
            `tell application "Terminal" to do script "${escaped}"`,
            '-e',
            'tell application "Terminal" to activate',
          ],
        },
      ],
    };
  }

  // `exec bash` at the end leaves the window open on whatever the command printed.
  return {
    cwd,
    attempts: LINUX_TERMINALS.map((file) => ({
      file,
      args: ['-e', 'bash', '-lc', `${command}; exec bash`],
    })),
  };
}
