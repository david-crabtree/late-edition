import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { Signal } from '../core/signal.js';
import { makeSignalId, shortHash } from '../core/signal.js';
import { clampText, optNumber, optString, requireString } from './helpers.js';
import type { AdapterState, FetchContext, SourceAdapter, SourceConfig } from './types.js';

/** File extensions we treat as readable text for the signal body. */
const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.log',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.tsv',
  '.html',
  '.htm',
  '.xml',
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.sh',
  '.env',
  '.ini',
  '.toml',
]);

/**
 * Watches a local directory for new or changed files. Covers exports, logs,
 * notes — anything that lands as a file. Read-only.
 *
 * Config:
 *   { id, type: 'folder', path: './exports', maxDepth?: number, max?: number, ext?: string }
 * `ext` optionally restricts to a comma-separated list of extensions (e.g. '.md,.txt').
 */
export const folderAdapter: SourceAdapter = {
  type: 'folder',
  displayName: 'Local folder watch',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const root = requireString(source, 'path');
    const maxDepth = optNumber(source, 'maxDepth', 4);
    const max = optNumber(source, 'max', 100);
    const extFilter = parseExtFilter(optString(source, 'ext'));

    const rootInfo = await stat(root).catch(() => null);
    if (!rootInfo?.isDirectory()) {
      throw new Error(`folder: "${root}" is not an existing directory.`);
    }

    const files = await walk(root, maxDepth);
    const prior = (ctx.state.get<Record<string, string>>('fileHashes') ?? {}) as Record<
      string,
      string
    >;
    const nextHashes: Record<string, string> = {};
    const signals: Signal[] = [];

    for (const abs of files.slice(0, max * 4)) {
      const ext = extname(abs).toLowerCase();
      if (extFilter && !extFilter.has(ext)) continue;
      const rel = relative(root, abs);
      let info: Awaited<ReturnType<typeof stat>>;
      try {
        info = await stat(abs);
      } catch {
        continue;
      }
      const fingerprint = shortHash(rel, String(info.size), String(Math.floor(info.mtimeMs)));
      nextHashes[rel] = fingerprint;
      if (prior[rel] === fingerprint) continue; // unchanged

      const isNew = !(rel in prior);
      const body = TEXT_EXT.has(ext)
        ? clampText(await readText(abs))
        : `Binary file, ${info.size} bytes.`;
      signals.push({
        id: makeSignalId(source.id, fingerprint),
        sourceId: source.id,
        sourceType: 'folder',
        timestamp: new Date(info.mtimeMs).toISOString(),
        title: `${isNew ? 'New' : 'Changed'} file: ${rel}`,
        body,
        hash: fingerprint,
        meta: { path: rel, bytes: info.size, changeType: isNew ? 'new' : 'modified' },
      });
      if (signals.length >= max) break;
    }

    persist(ctx.state, nextHashes);
    return signals;
  },
};

function parseExtFilter(ext?: string): Set<string> | undefined {
  if (!ext) return undefined;
  return new Set(
    ext
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .map((e) => (e.startsWith('.') ? e : `.${e}`)),
  );
}

async function walk(root: string, maxDepth: number): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) return;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        await recurse(full, depth + 1);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await recurse(root, 0);
  return out.sort();
}

async function readText(abs: string): Promise<string> {
  try {
    return await readFile(abs, 'utf8');
  } catch {
    return '';
  }
}

function persist(state: AdapterState, hashes: Record<string, string>): void {
  state.set('fileHashes', hashes);
}
