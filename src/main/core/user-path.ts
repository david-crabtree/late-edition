import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The PATH the user actually has, rather than the one a GUI app is handed.
 *
 * On macOS, an app launched from Finder or the Dock inherits almost nothing: roughly
 * `/usr/bin:/bin:/usr/sbin:/sbin`, and none of the places agent CLIs install to. Claude
 * Code puts itself in `~/.local/bin`, Homebrew uses `/opt/homebrew/bin`, npm globals land
 * somewhere else again. So a person can install an agent, sign in, watch it work in their
 * terminal, and the app still reports it as not installed — with nothing on screen to
 * explain why, because from the app's point of view the command genuinely is not there.
 *
 * Two ways round it, both used. Ask the login shell what its PATH is, which catches
 * whatever that person has actually configured; and add the handful of well-known
 * locations if they exist, which catches the case where the shell cannot be asked.
 *
 * Windows is unaffected — a process launched from Explorer gets the full system PATH.
 */

/** Wraps the answer so anything an rc file prints on the way can be discarded. */
const MARK = '__LATE_EDITION_PATH__';

/**
 * PATH's separator on a given platform. Follows the platform being reasoned about rather
 * than the one running, so this is honest when asked about another — and testable.
 */
const sep = (platform: NodeJS.Platform) => (platform === 'win32' ? ';' : ':');

/** Where agent CLIs put themselves, when nobody has said otherwise. */
export function wellKnownBinDirs(home = homedir()): string[] {
  return [
    join(home, '.local', 'bin'), // Claude Code's native installer
    join(home, '.bun', 'bin'),
    join(home, '.deno', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, 'go', 'bin'),
    '/opt/homebrew/bin', // Homebrew on Apple Silicon
    '/opt/homebrew/sbin',
    '/usr/local/bin', // Homebrew on Intel, and most installers
    '/usr/local/sbin',
  ];
}

/** Ask the user's login shell what PATH it has. Empty string when it cannot be asked. */
function loginShellPath(shell: string | undefined): string {
  if (!shell) return '';
  try {
    // -l so profile files are read, -i because some people only set PATH in .zshrc, and
    // printf rather than echo so nothing adds a newline of its own.
    const out = execFileSync(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(MARK)[1] ?? '';
  } catch {
    // No shell, a shell that refuses -i, or an rc file that hangs. The well-known
    // directories below still cover the common installs.
    return '';
  }
}

/**
 * Merge the login shell's PATH and the well-known locations into the one given.
 * Order is preserved and nothing is dropped, so this can only ever find more.
 */
export function resolveUserPath(
  current: string | undefined,
  opts: {
    platform?: NodeJS.Platform;
    /**
     * Which login shell to ask. Omit for the user's own. **`null` asks none**, which is
     * how a test stays hermetic — otherwise it silently inherits whatever PATH the machine
     * running it happens to have, and passes or fails for reasons that have nothing to do
     * with the code.
     */
    shell?: string | null;
    home?: string;
    exists?: (p: string) => boolean;
  } = {},
): string {
  const platform = opts.platform ?? process.platform;
  const exists = opts.exists ?? existsSync;
  const d = sep(platform);
  const parts = (current ?? '').split(d).filter(Boolean);

  // Windows hands a launched process the real PATH already.
  if (platform === 'win32') return parts.join(d);

  const seen = new Set(parts);
  const add = (dir: string) => {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      parts.push(dir);
    }
  };

  const shell = opts.shell === null ? undefined : (opts.shell ?? process.env.SHELL);
  for (const dir of loginShellPath(shell).split(d)) {
    if (dir) add(dir);
  }
  for (const dir of wellKnownBinDirs(opts.home)) {
    if (exists(dir)) add(dir);
  }

  return parts.join(d);
}

/**
 * Do it once, to this process, so every provider that spawns a CLI sees the same PATH.
 * Returns what was added, for a diagnostic that would otherwise be guesswork.
 */
export function applyUserPath(): { before: string; after: string; added: string[] } {
  const before = process.env.PATH ?? '';
  const after = resolveUserPath(before);
  process.env.PATH = after;
  const d = sep(process.platform);
  const had = new Set(before.split(d).filter(Boolean));
  return { before, after, added: after.split(d).filter((p) => p && !had.has(p)) };
}
