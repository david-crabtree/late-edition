import type { Signal } from '../core/signal.js';
import { makeSignalId, shortHash } from '../core/signal.js';
import { clampText, filterUnseen, optNumber, optString, requireString } from './helpers.js';
import type { FetchContext, SourceAdapter, SourceConfig } from './types.js';

/**
 * GitHub repository activity via the REST API (no SDK). Public repos need no token;
 * private repos need a PAT (config `token` or the GITHUB_TOKEN env var). Read-only.
 *
 * Config:
 *   { id, type: 'github', repo: 'owner/name', kinds?: string[], token?: string, max?: number }
 * kinds: any of 'issues' | 'pulls' | 'releases' | 'commits' (default ['issues','releases']).
 */
const API = 'https://api.github.com';

export const githubAdapter: SourceAdapter = {
  type: 'github',
  displayName: 'GitHub repository',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const repo = requireString(source, 'repo');
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      throw new Error(`github: \`repo\` must be "owner/name", got "${repo}".`);
    }
    const token = optString(source, 'token') ?? process.env.GITHUB_TOKEN;
    const max = optNumber(source, 'max', 20);
    const kinds = Array.isArray(source.kinds) ? (source.kinds as string[]) : ['issues', 'releases'];

    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'late-edition',
      'x-github-api-version': '2022-11-28',
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const candidates: Signal[] = [];
    for (const kind of kinds) {
      candidates.push(...(await fetchKind(kind, repo, headers, max, source, ctx)));
    }
    return filterUnseen(ctx.state, candidates, { keep: 1000 });
  },
};

async function fetchKind(
  kind: string,
  repo: string,
  headers: Record<string, string>,
  max: number,
  source: SourceConfig,
  ctx: FetchContext,
): Promise<Signal[]> {
  const paths: Record<string, string> = {
    issues: `/repos/${repo}/issues?state=all&sort=updated&direction=desc&per_page=${max}`,
    pulls: `/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${max}`,
    releases: `/repos/${repo}/releases?per_page=${max}`,
    commits: `/repos/${repo}/commits?per_page=${max}`,
  };
  const path = paths[kind];
  if (!path) return [];

  const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    if (res.status === 404)
      throw new Error(`github: repo "${repo}" not found (or private w/o token).`);
    if (res.status === 403) throw new Error('github: rate-limited or forbidden (add a token).');
    throw new Error(`github: ${kind} request failed with ${res.status}.`);
  }
  const items = (await res.json()) as Record<string, unknown>[];
  return items.map((item) => toSignal(kind, item, source, ctx)).filter((s): s is Signal => !!s);
}

function toSignal(
  kind: string,
  item: Record<string, unknown>,
  source: SourceConfig,
  ctx: FetchContext,
): Signal | null {
  if (kind === 'commits') {
    const sha = str(item.sha);
    const commit = item.commit as Record<string, unknown> | undefined;
    const message = str(commit?.message) ?? '';
    if (!sha) return null;
    const author = (commit?.author as Record<string, unknown> | undefined) ?? {};
    return mk(source, ctx, {
      key: sha,
      title: message.split('\n')[0] ?? sha.slice(0, 8),
      body: message,
      url: str(item.html_url),
      meta: { kind, sha, author: str(author.name), date: str(author.date) },
      ts: str(author.date),
    });
  }

  if (kind === 'releases') {
    const id = str(item.id) ?? str(item.tag_name);
    if (!id) return null;
    return mk(source, ctx, {
      key: `release-${id}`,
      title: `Release ${str(item.name) ?? str(item.tag_name) ?? id}`,
      body: str(item.body) ?? '',
      url: str(item.html_url),
      meta: { kind, tag: str(item.tag_name), prerelease: item.prerelease },
      ts: str(item.published_at) ?? str(item.created_at),
    });
  }

  // issues + pulls
  const number = num(item.number);
  if (number === undefined) return null;
  const isPr = 'pull_request' in item || kind === 'pulls';
  const updated = str(item.updated_at) ?? '';
  return mk(source, ctx, {
    key: `${isPr ? 'pr' : 'issue'}-${number}-${updated}`,
    title: `${isPr ? 'PR' : 'Issue'} #${number}: ${str(item.title) ?? ''}`,
    body: str(item.body) ?? '',
    url: str(item.html_url),
    meta: {
      kind: isPr ? 'pull' : 'issue',
      number,
      state: str(item.state),
      user: str((item.user as Record<string, unknown> | undefined)?.login),
    },
    ts: updated,
  });
}

function mk(
  source: SourceConfig,
  ctx: FetchContext,
  d: {
    key: string;
    title: string;
    body: string;
    url?: string;
    meta: Record<string, unknown>;
    ts?: string;
  },
): Signal {
  const hash = shortHash(source.id, d.key);
  return {
    id: makeSignalId(source.id, hash),
    sourceId: source.id,
    sourceType: 'github',
    timestamp: d.ts ?? ctx.now.toISOString(),
    title: d.title.trim(),
    body: clampText(d.body),
    url: d.url,
    hash,
    meta: d.meta,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
