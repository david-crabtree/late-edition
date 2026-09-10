import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class CliNotInstalledError extends Error {}
export class CliTimeoutError extends Error {}

/**
 * Is `cmd` findable on the Windows PATH (as an .exe/.cmd/.bat/… shim)? npm installs CLIs
 * as `foo.cmd` batch shims, which `execFile('foo')` can't launch (ENOENT) and can't run
 * without a shell — so on Windows we launch through `cmd.exe /c`. We check existence
 * ourselves first so a genuinely-missing binary still reports as not installed, rather
 * than as a cmd.exe "not recognized" exit code.
 */
function windowsHasCommand(cmd: string): boolean {
  if (cmd.includes('/') || cmd.includes('\\')) return existsSync(cmd);
  const exts = ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')];
  const dirs = (process.env.PATH ?? '').split(';').filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      if (existsSync(join(dir, cmd + ext))) return true;
    }
  }
  return false;
}

/**
 * Run a CLI to completion, capturing stdout/stderr. Kills the process on timeout.
 * Throws {@link CliNotInstalledError} when the binary isn't on PATH (ENOENT), and
 * {@link CliTimeoutError} on timeout — callers turn these into clean provider errors.
 */
export function runCli(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number; input?: string; env?: NodeJS.ProcessEnv } = {
    timeoutMs: 120_000,
  },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    // On Windows, launch through `cmd.exe /c` so npm's `.cmd` shims resolve. Pass the
    // real prompt via `opts.input` (stdin), never argv — cmd.exe mangles quotes/newlines
    // and has an ~8 KB command-line limit that research materials would blow past.
    const isWin = process.platform === 'win32';
    if (isWin && !windowsHasCommand(cmd)) {
      reject(new CliNotInstalledError(`\`${cmd}\` is not installed or not on PATH.`));
      return;
    }
    const file = isWin ? (process.env.ComSpec ?? 'cmd.exe') : cmd;
    const fileArgs = isWin ? ['/c', cmd, ...args] : args;
    const child = execFile(
      file,
      fileArgs,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        env: opts.env ?? process.env,
      },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
          if (e.code === 'ENOENT') {
            reject(new CliNotInstalledError(`\`${cmd}\` is not installed or not on PATH.`));
            return;
          }
          if (e.killed || e.signal === 'SIGTERM') {
            reject(new CliTimeoutError(`\`${cmd}\` timed out after ${opts.timeoutMs}ms.`));
            return;
          }
          // A non-zero exit still resolves — callers inspect stdout/stderr/code.
          resolve({
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            code: e.code === undefined ? 1 : Number(e.code) || 1,
          });
          return;
        }
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: 0 });
      },
    );
    if (opts.input !== undefined && child.stdin) {
      child.stdin.end(opts.input);
    }
  });
}

/**
 * Lightweight liveness probe for detection: run a fast command (usually
 * `--version`) and report whether the binary exists. Never throws.
 */
export async function probe(
  cmd: string,
  args: string[],
  timeoutMs = 5000,
): Promise<{ installed: boolean; stdout: string; code: number }> {
  try {
    const { stdout, code } = await runCli(cmd, args, { timeoutMs });
    return { installed: true, stdout: stdout.trim(), code };
  } catch (err) {
    if (err instanceof CliNotInstalledError) return { installed: false, stdout: '', code: -1 };
    // Timeout or other: the binary exists but misbehaved — treat as installed.
    return { installed: true, stdout: '', code: -1 };
  }
}
