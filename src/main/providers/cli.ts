import { execFile } from 'node:child_process';

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class CliNotInstalledError extends Error {}
export class CliTimeoutError extends Error {}

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
    const child = execFile(
      cmd,
      args,
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
