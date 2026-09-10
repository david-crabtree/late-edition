import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadNewsroom } from '../config/newsroom.js';
import type { Edition, SourceRef, Story } from '../core/edition.js';
import { type CopyShape, getFormat, shapeDirective } from '../core/formats.js';
import { EditionLog, type LogEvent } from '../store/log.js';
import { paths } from '../store/paths.js';
import { resolveWriter } from './agents.js';
import { runJob } from './agents.js';
import { loadPrompt, renderTemplate } from './prompts.js';

export interface RewriteOptions {
  root: string;
  /** The finished edition to take the story from. */
  editionId: string;
  /** Which story. Defaults to the lead. */
  slug?: string;
  /** Format, tone and length to write it in. */
  shape: CopyShape;
  forceProvider?: string;
  onEvent?: (ev: LogEvent) => void;
  timeoutMs?: number;
}

export interface RewriteResult {
  editionId: string;
  slug: string;
  format: string;
  formatLabel: string;
  /** The new copy, citations already resolved to [1], [2]… so it can be pasted anywhere. */
  text: string;
  /** The numbered sources the copy refers to, in order. */
  sources: { n: number; title: string; url?: string }[];
  tokens: number;
}

const CITE_RE = /\[((?:[a-z0-9_]+:[0-9a-f]{6,})(?:\s*,\s*[a-z0-9_]+:[0-9a-f]{6,})*)\]/gi;
const STRAY_CITE = /\[#[^\]\n]{0,60}\]|\[(?:ref|citation needed|source)\]/gi;

/**
 * Swap literal signal ids for reader-facing numbers, and list the sources in the order they
 * are first cited. A rewrite is for pasting somewhere else, so it has to leave the app as
 * readable text rather than as internal tokens.
 */
function resolveCitations(
  body: string,
  refs: SourceRef[],
): { text: string; sources: { n: number; title: string; url?: string }[] } {
  const numberOf = new Map<string, number>();
  const ordered: SourceRef[] = [];
  const byId = new Map(refs.map((r) => [r.signalId, r]));
  const text = body
    .replace(CITE_RE, (_m, ids: string) => {
      const ns: number[] = [];
      for (const raw of ids.split(',')) {
        const id = raw.trim();
        if (!numberOf.has(id)) {
          const ref = byId.get(id);
          if (!ref) continue;
          numberOf.set(id, ordered.length + 1);
          ordered.push(ref);
        }
        const n = numberOf.get(id);
        if (n) ns.push(n);
      }
      return ns.length ? `[${ns.join(',')}]` : '';
    })
    .replace(STRAY_CITE, '')
    .replace(/[ \t]+([.,;:)])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return {
    text,
    sources: ordered.map((r, i) => ({ n: i + 1, title: r.title, url: r.url })),
  };
}

/** The reporting behind a story, as the writer needs to see it. */
function materials(story: Story): string {
  const lines: string[] = [];
  lines.push(`ORIGINAL HEADLINE: ${story.headline}`);
  if (story.standfirst) lines.push(`STANDFIRST: ${story.standfirst}`);
  if (story.chosenAngle) lines.push(`EDITOR'S ANGLE: ${story.chosenAngle}`);
  lines.push('', 'SOURCES (cite by copying an id verbatim):');
  for (const r of story.sources) {
    lines.push(`- ${r.signalId} — ${r.title}${r.url ? ` (${r.url})` : ''}`);
  }
  lines.push('', 'THE FILED COPY (already checked by the copy desk):', story.body);
  for (const rep of story.reports) {
    if (rep.summary) lines.push('', `REPORTER NOTE (${rep.reporter ?? 'desk'}): ${rep.summary}`);
  }
  return lines.join('\n');
}

/**
 * Write a finished story again in a different shape.
 *
 * This is deliberately not a new edition. The reporting, the sources and the copy desk's
 * verdict already exist on disk, so a rewrite is one writer call against material that has
 * already been checked — cheap enough to try four formats off one piece of research, and
 * it cannot introduce a source the original didn't have.
 */
export async function rewriteStory(opts: RewriteOptions): Promise<RewriteResult> {
  const p = paths(opts.root);
  const dir = p.editionDir(opts.editionId);
  const edition = JSON.parse(readFileSync(join(dir, 'edition.json'), 'utf8')) as Edition;
  const story = opts.slug ? edition.stories.find((s) => s.slug === opts.slug) : edition.stories[0];
  if (!story) {
    throw new Error(`No story "${opts.slug ?? '(lead)'}" in edition ${opts.editionId}.`);
  }

  const newsroom = await loadNewsroom(opts.root);
  const log = new EditionLog(join(dir, 'log.jsonl'), opts.onEvent);
  const fmt = getFormat(opts.shape.format);
  log.emit('REWRITE', 'stage_start', { story: story.slug, format: fmt.id });

  const template = await loadPrompt(opts.root, 'writer');
  const resolved = resolveWriter(newsroom, story.beatId, opts.forceProvider);
  const systemPrompt = renderTemplate(template, {
    paperName: edition.paperName,
    beatName: story.beatName,
    style: newsroom.style,
    chosenAngle: story.chosenAngle || story.headline,
    shape: shapeDirective(opts.shape),
    sourceCount: String(story.sources.length),
  });

  const outcome = await runJob<string>({
    role: 'writer',
    resolved,
    systemPrompt,
    userPrompt: materials(story),
    signals: [],
    timeoutMs: opts.timeoutMs ?? 120_000,
    wantJson: false,
  });

  const tokens = (outcome.usage?.inputTokens ?? 0) + (outcome.usage?.outputTokens ?? 0);
  const { text, sources } = resolveCitations(outcome.text.trim(), story.sources);
  log.emit('usage', 'spent', {
    role: 'writer',
    provider: outcome.providerId,
    model: outcome.model,
    tokens,
    total: tokens,
  });
  log.emit('REWRITE', 'stage_done', { story: story.slug, format: fmt.id, chars: text.length });

  // Keep it next to the edition it came from, so a rewrite is an artefact like everything else.
  try {
    writeFileSync(join(dir, `rewrite-${story.slug}-${fmt.id}.md`), withSources(text, sources));
  } catch {
    // A rewrite that can't be filed is still a rewrite — hand it back regardless.
  }
  return {
    editionId: edition.id,
    slug: story.slug,
    format: fmt.id,
    formatLabel: fmt.label,
    text,
    sources,
    tokens,
  };
}

/** The copy with its numbered sources appended — what gets written to disk and copied out. */
export function withSources(
  text: string,
  sources: { n: number; title: string; url?: string }[],
): string {
  if (!sources.length) return text;
  const list = sources.map((s) => `[${s.n}] ${s.title}${s.url ? ` — ${s.url}` : ''}`);
  return `${text}\n\nSources\n${list.join('\n')}`;
}
