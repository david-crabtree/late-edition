import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
