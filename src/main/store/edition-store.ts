import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Edition } from '../core/edition.js';
import { paths } from './paths.js';

/** Allocate the next edition id and sequential number for a given date. */
export function nextEditionId(root: string, date: string): { id: string; number: number } {
  const p = paths(root);
  let count = 0;
  try {
    count = readdirSync(p.editionsDir, { withFileTypes: true }).filter((e) =>
      e.isDirectory(),
    ).length;
  } catch {
    // no editions yet
  }
  const number = count + 1;
  const id = `${date}-${String(number).padStart(3, '0')}`;
  return { id, number };
}

/** Allocate the next Late Extra id (e.g. "2026-09-09-x001"), distinct from daily editions. */
export function nextExtraId(root: string, date: string): { id: string; number: number } {
  const p = paths(root);
  let count = 0;
  try {
    count = readdirSync(p.editionsDir, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.includes('-x'),
    ).length;
  } catch {
    // no extras yet
  }
  const number = count + 1;
  return { id: `${date}-x${String(number).padStart(3, '0')}`, number };
}

/** Ensure a story's directory exists and return it. */
export function ensureStoryDir(root: string, editionId: string, slug: string): string {
  const dir = paths(root).storyDir(editionId, slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write an arbitrary artefact into a story's directory. */
export function writeStoryFile(
  root: string,
  editionId: string,
  slug: string,
  name: string,
  contents: string,
): void {
  const dir = ensureStoryDir(root, editionId, slug);
  const target = join(dir, name);
  mkdirSync(dirname(target), { recursive: true }); // `name` may include subdirs (e.g. reports/x.md)
  writeFileSync(target, contents, 'utf8');
}

/** Persist the finished edition: JSON metadata plus rendered Markdown and HTML. */
export function writeEdition(
  root: string,
  edition: Edition,
  rendered: { markdown: string; html: string },
): string {
  const dir = paths(root).editionDir(edition.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'edition.json'), JSON.stringify(edition, null, 2), 'utf8');
  writeFileSync(join(dir, 'edition.md'), rendered.markdown, 'utf8');
  writeFileSync(join(dir, 'edition.html'), rendered.html, 'utf8');
  return dir;
}

/** True if an edition directory already exists (used by resume). */
export function editionExists(root: string, editionId: string): boolean {
  return existsSync(paths(root).editionDir(editionId));
}

/** One past edition, as the back-issues list needs it. */
export interface EditionSummary {
  id: string;
  /** ISO date the edition carries, or the folder's date prefix as a fallback. */
  date: string;
  number: number;
  lateExtra: boolean;
  headline: string;
  standfirst: string;
  storyCount: number;
  tokens: number;
  /** False when the run never got as far as writing the paper (crashed or was stopped). */
  finished: boolean;
}

/**
 * Every edition this newsroom has filed, newest first.
 *
 * Editions have always been saved; nothing could list them, so the only way back to
 * yesterday's paper was the file browser. Reads `edition.json` where a run finished and
 * still lists the folder where it didn't, so an abandoned run is visible rather than gone.
 */
export function listEditions(root: string, limit = 200): EditionSummary[] {
  const p = paths(root);
  let dirs: string[];
  try {
    dirs = readdirSync(p.editionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return []; // a newsroom that has never filed
  }
  const out: EditionSummary[] = [];
  for (const id of dirs) {
    const fallbackDate = /^(\d{4}-\d{2}-\d{2})/.exec(id)?.[1] ?? '';
    try {
      const ed = JSON.parse(
        readFileSync(join(p.editionDir(id), 'edition.json'), 'utf8'),
      ) as Edition;
      const lead = ed.stories?.[0];
      out.push({
        id: ed.id ?? id,
        date: ed.date ?? fallbackDate,
        number: ed.number ?? 0,
        // `nextExtraId` encodes it in the id, so trust that too — an older edition.json
        // written before the flag existed would otherwise list as an ordinary edition.
        lateExtra: Boolean(ed.lateExtra) || id.includes('-x'),
        headline: lead?.headline ?? 'A quiet day on the wire',
        standfirst: lead?.standfirst ?? '',
        storyCount: ed.stories?.length ?? 0,
        tokens: (ed.tokenUsage ?? []).reduce(
          (n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
          0,
        ),
        finished: existsSync(join(p.editionDir(id), 'edition.html')),
      });
    } catch {
      out.push({
        id,
        date: fallbackDate,
        number: 0,
        lateExtra: id.includes('-x'),
        headline: 'Never went to press',
        standfirst: 'This run stopped before the paper was written.',
        storyCount: 0,
        tokens: 0,
        finished: false,
      });
    }
  }
  // Ids are date-then-sequence, so a plain descending sort is newest first.
  out.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return out.slice(0, limit);
}
