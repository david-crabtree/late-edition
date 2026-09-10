import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Edition } from '../core/edition.js';
import { paths } from './paths.js';

/** One archived story, flattened for search and related-coverage lookups. */
export interface MorgueEntry {
  editionId: string;
  number: number;
  date: string;
  lateExtra: boolean;
  slug: string;
  headline: string;
  beatId: string;
  /** Significant lowercased terms, for overlap scoring. */
  terms: string[];
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'at',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'this',
  'that',
  'as',
  'has',
  'have',
  'had',
  'new',
  'now',
  'not',
  'via',
  'into',
  'out',
  'up',
  'off',
  'over',
  'about',
]);

/** Tokenize text into significant terms (lowercase, no stopwords, length > 3). */
export function terms(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 3 && !STOPWORDS.has(raw)) seen.add(raw);
  }
  return [...seen];
}

/** Scan every edition on disk into a flat list of story entries (newest first). */
export function scanMorgue(root: string): MorgueEntry[] {
  const dir = paths(root).editionsDir;
  let names: string[] = [];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
  const entries: MorgueEntry[] = [];
  for (const name of names) {
    let ed: Edition;
    try {
      ed = JSON.parse(readFileSync(join(dir, name, 'edition.json'), 'utf8')) as Edition;
    } catch {
      continue;
    }
    for (const s of ed.stories) {
      entries.push({
        editionId: ed.id,
        number: ed.number,
        date: ed.date,
        lateExtra: Boolean(ed.lateExtra),
        slug: s.slug,
        headline: s.headline,
        beatId: s.beatId,
        terms: terms(`${s.headline} ${s.standfirst} ${s.beatName}`),
      });
    }
  }
  return entries;
}

/** Free-text search over archived headlines (term overlap, then substring fallback). */
export function searchMorgue(root: string, query: string, limit = 20): MorgueEntry[] {
  const q = terms(query);
  const qLower = query.toLowerCase();
  const entries = scanMorgue(root);
  const scored = entries
    .map((e) => {
      const overlap = e.terms.filter((t) => q.includes(t)).length;
      const substring = e.headline.toLowerCase().includes(qLower) ? 1 : 0;
      return { e, score: overlap * 2 + substring };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}

/** One assignment's recent editions, newest first — the history a new run builds on. */
export interface CoverageItem {
  editionId: string;
  date: string;
  headline: string;
  standfirst: string;
}

/** Recent coverage for a standing assignment, to feed the next run as "what we've done". */
export function assignmentCoverage(root: string, assignmentId: string, limit = 5): CoverageItem[] {
  const dir = paths(root).editionsDir;
  let names: string[] = [];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
  const out: CoverageItem[] = [];
  for (const name of names) {
    if (out.length >= limit) break;
    let ed: Edition;
    try {
      ed = JSON.parse(readFileSync(join(dir, name, 'edition.json'), 'utf8')) as Edition;
    } catch {
      continue;
    }
    if (ed.assignmentId !== assignmentId) continue;
    for (const s of ed.stories) {
      out.push({ editionId: ed.id, date: ed.date, headline: s.headline, standfirst: s.standfirst });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Past stories related to a given one, by shared terms (excludes the current edition). */
export function relatedCoverage(
  entries: MorgueEntry[],
  story: { terms: string[]; beatId: string },
  excludeEditionId: string,
  limit = 3,
): MorgueEntry[] {
  const want = new Set(story.terms);
  return entries
    .filter((e) => e.editionId !== excludeEditionId)
    .map((e) => {
      const overlap = e.terms.filter((t) => want.has(t)).length;
      const sameBeat = e.beatId === story.beatId ? 1 : 0;
      return { e, score: overlap + sameBeat };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}
