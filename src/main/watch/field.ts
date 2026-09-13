import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../adapters/index.js'; // register built-in source adapters (side-effect import)
import { assertFetchableUrl } from '../adapters/helpers.js';
import { runSource } from '../adapters/run.js';
import type { SourceConfig } from '../adapters/types.js';
import { loadNewsroom } from '../config/newsroom.js';
import type { Edition } from '../core/edition.js';
import type { Signal } from '../core/signal.js';
import { slugify } from '../pipeline/draft.js';
import { paths } from '../store/paths.js';

/**
 * The field desk.
 *
 * A finished edition already knows which pages the story came from. This turns those into
 * a standing beat and keeps an eye on them, so the next time one of them changes you hear
 * about it instead of having to remember to look.
 *
 * The thing that makes this affordable: **checking costs nothing.** Source adapters are
 * pure fetch-and-diff with no model anywhere near them, so watching forty pages every day
 * is free. Tokens are only spent when something actually moved and you say run it — and
 * even then the expensive part (discovery) has already happened, because the sources are
 * known.
 */

/** One page being watched, and what it has done lately. */
export interface WatchedBeat {
  id: string;
  name: string;
  /** The edition this beat was promoted from. */
  fromEdition?: string;
  sources: { id: string; type: string; url?: string }[];
  lastCheckedAt?: string;
  /** Signals seen since you last looked at them. */
  pending: Signal[];
}

interface SpikeFile {
  lastCheckedAt?: string;
  pending: Signal[];
}

function spikeDir(root: string): string {
  return join(paths(root).wireDir, '.spike');
}
function spikeFile(root: string, beatId: string): string {
  return join(spikeDir(root), `${beatId}.json`);
}
function readSpike(root: string, beatId: string): SpikeFile {
  try {
    return JSON.parse(readFileSync(spikeFile(root, beatId), 'utf8')) as SpikeFile;
  } catch {
    return { pending: [] };
  }
}
function writeSpike(root: string, beatId: string, s: SpikeFile): void {
  mkdirSync(spikeDir(root), { recursive: true });
  writeFileSync(spikeFile(root, beatId), JSON.stringify(s, null, 2), 'utf8');
}

/** Beats created by the field desk carry this marker, so hand-written beats are left alone. */
const FIELD_MARKER = '# Watched by the field desk.';

/** A feed gets the rss adapter; anything else gets diffed as a web page. */
function sourceFor(url: string, i: number): SourceConfig {
  const feed = /(\/feed\/?$|\.rss$|\.atom$|\/rss(\/|$)|format=rss|feeds?\.)/i.test(url);
  return {
    id: `src${i + 1}`,
    type: feed ? 'rss' : 'web_diff',
    url,
  } as SourceConfig;
}

function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface PromoteResult {
  beatId: string;
  name: string;
  watched: number;
  /** Sources dropped because they had no URL to poll. */
  skipped: number;
}

/**
 * Turn a finished edition's sources into a watched beat.
 *
 * Research is set to 0: the whole point is that the digging is already done, so a later
 * run on this beat reports straight from what changed rather than paying the researcher
 * again. That's where the saving comes from — the researcher is 56-60% of a fresh edition.
 */
export async function watchEdition(
  root: string,
  editionId: string,
  opts: { slug?: string; name?: string } = {},
): Promise<PromoteResult> {
  const dir = paths(root).editionDir(editionId);
  const edition = JSON.parse(readFileSync(join(dir, 'edition.json'), 'utf8')) as Edition;
  const story = opts.slug ? edition.stories.find((s) => s.slug === opts.slug) : edition.stories[0];
  if (!story) throw new Error(`No story "${opts.slug ?? '(lead)'}" in edition ${editionId}.`);

  // These URLs came out of other people's pages, feeds and agent output, not out of the
  // user's config, so a private or local address is refused rather than watched.
  const urls: string[] = [];
  for (const ref of story.sources) {
    if (!ref.url || urls.includes(ref.url)) continue;
    try {
      assertFetchableUrl(ref.url, 'field desk');
    } catch {
      continue;
    }
    urls.push(ref.url);
  }
  const skipped = story.sources.length - urls.length;
  if (!urls.length) {
    throw new Error('None of that story’s sources have a page to watch.');
  }

  const name = opts.name ?? story.headline.slice(0, 60);
  const beatId = slugify(`watch-${story.slug}-${editionId}`).slice(0, 60);
  const sources = urls.map(sourceFor);

  writeCase(root, { beatId, name, fromEdition: editionId, sources });
  writeSpike(root, beatId, { pending: [] });
  return { beatId, name, watched: urls.length, skipped };
}

/** Write (or rewrite) a case's beat file. Rewriting is how a source gets pulled. */
function writeCase(
  root: string,
  c: {
    beatId: string;
    name: string;
    fromEdition?: string;
    sources: { id: string; type: string; url?: string }[];
  },
): void {
  const lines = [
    FIELD_MARKER,
    c.fromEdition
      ? `# Opened from edition ${c.fromEdition}. Delete this file to drop the case.`
      : '# Delete this file to drop the case.',
    `id: ${c.beatId}`,
    `name: ${yamlQuote(c.name)}`,
    'reporter: "Ida Stringer"',
    '# The digging is already done - a run here reports what changed, it does not re-research.',
    'research: 0',
    'sources:',
  ];
  for (const s of c.sources) {
    lines.push(`  - id: ${s.id}`);
    lines.push(`    type: ${s.type}`);
    lines.push(`    url: ${yamlQuote(String(s.url))}`);
  }
  lines.push('');
  mkdirSync(paths(root).beatsDir, { recursive: true });
  writeFileSync(join(paths(root).beatsDir, `${c.beatId}.yaml`), lines.join('\n'), 'utf8');
}

/** Which edition a case was opened from, read back off its own file. */
function caseOrigin(root: string, beatId: string): string | undefined {
  try {
    const text = readFileSync(join(paths(root).beatsDir, `${beatId}.yaml`), 'utf8');
    return /# Opened from edition (\S+)\./.exec(text)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Pull one source off a case without dropping the whole thing - the page turned out to be
 * noise, or it changes every hour for no reason. Dropping the last source drops the case,
 * because a case watching nothing is just clutter.
 */
export async function dropSource(
  root: string,
  beatId: string,
  sourceId: string,
): Promise<{ ok: boolean; remaining: number; caseDropped: boolean }> {
  const beat = (await listWatched(root)).find((b) => b.id === beatId);
  if (!beat) return { ok: false, remaining: 0, caseDropped: false };
  const sources = beat.sources.filter((s) => s.id !== sourceId);
  if (sources.length === beat.sources.length) {
    return { ok: false, remaining: sources.length, caseDropped: false };
  }
  if (!sources.length) {
    unwatch(root, beatId);
    return { ok: true, remaining: 0, caseDropped: true };
  }
  writeCase(root, {
    beatId,
    name: beat.name,
    fromEdition: beat.fromEdition ?? caseOrigin(root, beatId),
    sources,
  });
  return { ok: true, remaining: sources.length, caseDropped: false };
}

/**
 * The most changes a single follow-up will report on.
 *
 * A case left alone for a month can accumulate dozens of diffs, and feeding all of them to
 * the reporter is exactly how a "cheap" follow-up turns into the most expensive run of the
 * week. The newest ones are the story; the rest stay on the spike.
 */
export const MAX_PER_RUN = 12;

/** Is this beat one the field desk created? */
function isFieldBeat(root: string, beatId: string): boolean {
  try {
    return readFileSync(join(paths(root).beatsDir, `${beatId}.yaml`), 'utf8').startsWith(
      FIELD_MARKER,
    );
  } catch {
    return false;
  }
}

/** Every beat the field desk is watching, with whatever is on its spike. */
export async function listWatched(root: string): Promise<WatchedBeat[]> {
  let nr: Awaited<ReturnType<typeof loadNewsroom>>;
  try {
    nr = await loadNewsroom(root);
  } catch {
    return [];
  }
  const out: WatchedBeat[] = [];
  for (const beat of nr.beats) {
    if (!isFieldBeat(root, beat.id)) continue;
    const spike = readSpike(root, beat.id);
    out.push({
      id: beat.id,
      name: beat.name,
      sources: beat.sources.map((s) => ({
        id: s.id,
        type: s.type,
        url: (s as { url?: string }).url,
      })),
      fromEdition: caseOrigin(root, beat.id),
      lastCheckedAt: spike.lastCheckedAt,
      pending: spike.pending ?? [],
    });
  }
  return out;
}

/** Stop watching: remove the beat file and its spike. */
export function unwatch(root: string, beatId: string): boolean {
  if (!isFieldBeat(root, beatId)) return false;
  rmSync(join(paths(root).beatsDir, `${beatId}.yaml`), { force: true });
  rmSync(spikeFile(root, beatId), { force: true });
  return true;
}

export interface CheckResult {
  beats: { id: string; name: string; moved: number; pending: number; error?: string }[];
  /** Total newly-changed signals across every watched beat. */
  moved: number;
  checkedAt: string;
  /** Always zero. Kept explicit because "does this cost me anything" is the first question. */
  tokens: 0;
}

/**
 * Poll every watched page and put whatever changed on the spike.
 *
 * **This spends no tokens.** Adapters fetch and diff; no model is involved at any point.
 * Nothing is written, nothing is judged, nothing runs. It just notices.
 */
export async function checkWatched(root: string, now: Date = new Date()): Promise<CheckResult> {
  const watched = await listWatched(root);
  const p = paths(root);
  const at = now.toISOString();
  const beats: CheckResult['beats'] = [];
  let moved = 0;

  for (const beat of watched) {
    const spike = readSpike(root, beat.id);
    const fresh: Signal[] = [];
    let error: string | undefined;
    for (const src of beat.sources) {
      const res = await runSource(src as SourceConfig, p.stateDir, now);
      if (res.error) {
        error = res.error;
        continue;
      }
      fresh.push(...res.signals);
    }
    // Keep what was already on the spike — you may not have looked at it yet.
    const seen = new Set((spike.pending ?? []).map((s) => s.id));
    const added = fresh.filter((s) => !seen.has(s.id));
    const pending = [...(spike.pending ?? []), ...added].slice(-50);
    writeSpike(root, beat.id, { lastCheckedAt: at, pending });
    moved += added.length;
    beats.push({
      id: beat.id,
      name: beat.name,
      moved: added.length,
      pending: pending.length,
      error,
    });
  }
  return { beats, moved, checkedAt: at, tokens: 0 };
}

/** Clear a beat's spike — you've read it, or you've decided it isn't a story. */
export function clearSpike(root: string, beatId: string): void {
  const spike = readSpike(root, beatId);
  writeSpike(root, beatId, { lastCheckedAt: spike.lastCheckedAt, pending: [] });
}

/** True when this newsroom has never had a field beat, so the app can offer to start one. */
export function hasWatches(root: string): boolean {
  try {
    return readdirSync(paths(root).beatsDir).some((f) =>
      isFieldBeat(root, f.replace(/\.yaml$/, '')),
    );
  } catch {
    return false;
  }
}
