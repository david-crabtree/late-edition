import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Signal } from '../core/signal.js';
import { makeSignalId } from '../core/signal.js';
import { clampText, filterUnseen, optNumber, optString, requireString } from './helpers.js';
import type { FetchContext, SourceAdapter, SourceConfig } from './types.js';

const run = promisify(execFile);

// Field/record separators (ASCII unit/record separators) unlikely to appear in
// commit messages.
const FS = String.fromCharCode(0x1f);
const RS = String.fromCharCode(0x1e);

/**
 * Reports new commits on a local git repository. Read-only: only ever runs `git
 * log`/`git show --stat`, never anything that mutates the repo.
 *
 * Config:
 *   { id, type: 'git_local', path: '.', branch?: string, max?: number }
 */
export const gitLocalAdapter: SourceAdapter = {
  type: 'git_local',
  displayName: 'Local git repository',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const cwd = requireString(source, 'path');
    const branch = optString(source, 'branch');
    const max = optNumber(source, 'max', 30);

    await assertGitRepo(cwd);

    const format = `${['%H', '%an', '%aI', '%s', '%b'].join(FS)}${RS}`;
    const args = ['log', `--max-count=${max}`, `--pretty=format:${format}`];
    if (branch) args.push(branch);

    const { stdout } = await run('git', ['-C', cwd, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });

    const candidates: Signal[] = [];
    for (const record of stdout.split(RS)) {
      const line = record.trim();
      if (!line) continue;
      const [hash, author, iso, subject, ...bodyParts] = line.split(FS);
      if (!hash || !subject) continue;
      const body = bodyParts.join(FS).trim();
      const stat = await shortStat(cwd, hash);
      candidates.push({
        id: makeSignalId(source.id, hash.slice(0, 12)),
        sourceId: source.id,
        sourceType: 'git_local',
        timestamp: iso ?? ctx.now.toISOString(),
        title: subject,
        body: clampText([body, stat].filter(Boolean).join('\n\n')),
        hash: hash.slice(0, 12),
        meta: { author, commit: hash, branch: branch ?? null },
      });
    }

    return filterUnseen(ctx.state, candidates);
  },
};

async function assertGitRepo(cwd: string): Promise<void> {
  try {
    await run('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree']);
  } catch (err) {
    throw new Error(
      `git_local: "${cwd}" is not a git repository (or git is not installed). ${
        err instanceof Error ? err.message : ''
      }`.trim(),
    );
  }
}

async function shortStat(cwd: string, hash: string): Promise<string> {
  try {
    const { stdout } = await run('git', ['-C', cwd, 'show', '--shortstat', '--oneline', hash]);
    const line = stdout
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /\bchanged\b/.test(l));
    return line ? `Changes: ${line}` : '';
  } catch {
    return '';
  }
}
