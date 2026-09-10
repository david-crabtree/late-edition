import { OUTPUT_DISCLAIMER } from '../core/disclaimer.js';
import type { Edition, SourceRef, Story } from '../core/edition.js';

/** Matches an inline citation token — `[sourceId:hash]` or a comma-separated group. */
const CITE_RE = /\[((?:[a-z0-9_]+:[0-9a-f]{6,})(?:\s*,\s*[a-z0-9_]+:[0-9a-f]{6,})*)\]/gi;

/**
 * A stray citation-like token a weaker model sometimes invents instead of a real id —
 * `[#3]`, `[ref]`, `[citation needed]`. These resolve to nothing, so scrub them from the
 * prose after real citations are converted, rather than let them render as an artifact.
 */
const STRAY_CITE = /\[#[^\]\n]{0,60}\]|\[(?:ref|citation needed|source)\]/gi;

/**
 * Number a story's sources for reader-facing display: cited-in-body sources first (in the
 * order they appear), then any uncited ones. Citations to ids not in the source list
 * (e.g. the editor's `brief:` instruction, which isn't a real source) map to nothing and
 * are dropped from the prose.
 */
function orderedSources(s: Story): { list: SourceRef[]; numberOf: Map<string, number> } {
  const numberOf = new Map<string, number>();
  const list: SourceRef[] = [];
  const byId = new Map(s.sources.map((r) => [r.signalId, r]));
  const add = (id: string) => {
    if (numberOf.has(id)) return;
    const ref = byId.get(id);
    if (!ref) return;
    numberOf.set(id, list.length + 1);
    list.push(ref);
  };
  for (const m of s.body.matchAll(CITE_RE)) {
    for (const id of (m[1] ?? '').split(',')) add(id.trim());
  }
  for (const r of s.sources) add(r.signalId);
  return { list, numberOf };
}

/** Map an inline citation token to the footnote numbers of the sources it names. */
function citeNumbers(ids: string, numberOf: Map<string, number>): number[] {
  return ids
    .split(',')
    .map((id) => numberOf.get(id.trim()))
    .filter((n): n is number => typeof n === 'number');
}

/** Tidy spacing left behind when a citation token is removed or moved to a superscript. */
function tidy(text: string): string {
  return text.replace(/[ \t]+([.,;:)])/g, '$1').replace(/[ \t]{2,}/g, ' ');
}

/** Render an edition as readable Markdown (the `edition.md` artefact). */
export function renderMarkdown(ed: Edition): string {
  const out: string[] = [];
  const date = new Date(ed.date).toDateString();

  out.push(`# ${ed.paperName}`);
  if (ed.lateExtra) out.push('### 🗞️ LATE EXTRA');
  if (ed.tagline) out.push(`*${ed.tagline}*`);
  out.push('');
  const label = ed.lateExtra ? 'Extra' : `No. ${ed.number}`;
  out.push(`**${label}** · ${date}${ed.weatherLine ? ` · ${ed.weatherLine}` : ''}`);
  out.push('');
  out.push('---');

  const pageOne = ed.stories.filter((s) => s.placement === 'page_one');
  const belowFold = ed.stories.filter((s) => s.placement !== 'page_one');
  const competing = ed.stories.filter((s) => s.competingTakes && s.competingTakes.length > 1);

  if (pageOne.length) {
    out.push('\n## Page One\n');
    for (const s of pageOne) out.push(storyMarkdown(s));
  }

  if (competing.length) {
    out.push('\n## Competing Takes\n');
    for (const s of competing) {
      out.push(`### ${s.headline}`);
      for (const t of s.competingTakes ?? []) out.push(`- **${t.reporter}:** ${t.angle}`);
      out.push('');
    }
  }

  if (belowFold.length) {
    out.push('\n## Below the Fold\n');
    for (const s of belowFold) out.push(storyMarkdown(s));
  }

  if (ed.briefs.length) {
    out.push('\n## Briefs\n');
    for (const b of ed.briefs) {
      out.push(`- ${b.text}${b.signalId ? ` [${b.signalId}]` : ''}${b.url ? ` — ${b.url}` : ''}`);
    }
  }

  if (ed.corrections.length) {
    out.push('\n## Corrections\n');
    for (const c of ed.corrections) {
      out.push(`- ${c.claim} — *${c.reason}*${c.reporter ? ` (${c.reporter})` : ''}`);
    }
  }

  if (ed.editorsLog.length) {
    out.push("\n## Editor's Log\n");
    for (const n of ed.editorsLog) out.push(`- ${n}`);
  }

  out.push('\n---');
  out.push(`\n**About this edition.** ${OUTPUT_DISCLAIMER}`);
  out.push(`\n*${tokenLine(ed)}*`);
  return `${out.join('\n')}\n`;
}

function storyMarkdown(s: Story): string {
  const lines = s.stopThePress
    ? ['**🛑 STOP THE PRESS**', '', `### ${s.headline}`]
    : [`### ${s.headline}`];
  if (s.standfirst) lines.push(`*${s.standfirst}*`);
  lines.push(`\nBy ${s.byline}\n`);
  const { list, numberOf } = orderedSources(s);
  const body = tidy(
    s.body
      .replace(CITE_RE, (_m, ids: string) => {
        const nums = citeNumbers(ids, numberOf);
        return nums.length ? `[${nums.join(',')}]` : '';
      })
      .replace(STRAY_CITE, ''),
  );
  lines.push(body);
  if (list.length) {
    lines.push('\n**Sources:**');
    list.forEach((r, i) => lines.push(`${i + 1}. ${r.title}${r.url ? ` — ${r.url}` : ''}`));
  }
  if (s.morgue?.length) {
    const past = s.morgue.map((m) => `${m.headline} (${m.editionId})`).join('; ');
    lines.push(`\n**From the morgue:** ${past}`);
  }
  if (s.rationale) lines.push(`\n> Editor's note: ${s.rationale}`);
  lines.push('');
  return lines.join('\n');
}

function tokenLine(ed: Edition): string {
  if (ed.tokenUsage.length === 0) return `Generated ${ed.generatedAt}. No token usage recorded.`;
  const byProvider = new Map<string, number>();
  for (const u of ed.tokenUsage) {
    const total = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
    byProvider.set(u.provider, (byProvider.get(u.provider) ?? 0) + total);
  }
  const parts = [...byProvider.entries()].map(([p, t]) => `${p}: ${t} tok`);
  return `Generated ${ed.generatedAt}. Usage — ${parts.join(', ')}.`;
}

/** Render an edition as a self-contained, newspaper-styled HTML page. */
export function renderHtml(ed: Edition): string {
  const date = new Date(ed.date).toDateString();
  const pageOne = ed.stories.filter((s) => s.placement === 'page_one');
  const belowFold = ed.stories.filter((s) => s.placement !== 'page_one');
  const competing = ed.stories.filter((s) => s.competingTakes && s.competingTakes.length > 1);

  const sections: string[] = [];
  if (pageOne.length) {
    sections.push(
      `<section class="page-one"><h2>Page One</h2>${pageOne.map(storyHtml).join('')}</section>`,
    );
  }
  if (competing.length) {
    sections.push(
      `<section class="competing"><h2>Competing Takes</h2>${competing
        .map(
          (s) =>
            `<article><h3>${esc(s.headline)}</h3><ul>${(s.competingTakes ?? [])
              .map((t) => `<li><strong>${esc(t.reporter)}:</strong> ${esc(t.angle)}</li>`)
              .join('')}</ul></article>`,
        )
        .join('')}</section>`,
    );
  }
  if (belowFold.length) {
    sections.push(
      `<section class="below-fold"><h2>Below the Fold</h2>${belowFold.map(storyHtml).join('')}</section>`,
    );
  }
  if (ed.briefs.length) {
    sections.push(
      `<section class="briefs"><h2>Briefs</h2><ul>${ed.briefs
        .map((b) => `<li>${esc(b.text)}${b.url ? ` <a href="${esc(b.url)}">↗</a>` : ''}</li>`)
        .join('')}</ul></section>`,
    );
  }
  if (ed.corrections.length) {
    sections.push(
      `<section class="corrections"><h2>Corrections</h2><ul>${ed.corrections
        .map(
          (c) =>
            `<li>${esc(c.claim)} — <em>${esc(c.reason)}</em>${c.reporter ? ` (${esc(c.reporter)})` : ''}</li>`,
        )
        .join('')}</ul></section>`,
    );
  }
  if (ed.editorsLog.length) {
    sections.push(
      `<section class="editors-log"><h2>Editor's Log</h2><ul>${ed.editorsLog
        .map((n) => `<li>${esc(n)}</li>`)
        .join('')}</ul></section>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ed.paperName)} — No. ${ed.number}</title>
<style>${CSS}</style>
</head>
<body>
<main class="paper">
  <header class="masthead${ed.lateExtra ? ' late-extra' : ''}">
    ${ed.lateExtra ? '<p class="extra-banner">🗞️ Late Extra</p>' : ''}
    <h1>${esc(ed.paperName)}</h1>
    ${ed.tagline ? `<p class="tagline">${esc(ed.tagline)}</p>` : ''}
    <p class="dateline">${ed.lateExtra ? 'Extra' : `No. ${ed.number}`} · ${esc(date)}${ed.weatherLine ? ` · ${esc(ed.weatherLine)}` : ''}</p>
  </header>
  ${sections.join('\n  ')}
  <footer class="colophon">
    <p class="disclaimer"><strong>About this edition.</strong> ${esc(OUTPUT_DISCLAIMER)}</p>
    <p>${esc(tokenLine(ed))}</p>
  </footer>
</main>
</body>
</html>
`;
}

function storyHtml(s: Story): string {
  const { list, numberOf } = orderedSources(s);
  const sources = list.length
    ? `<div class="sources"><strong>Sources</strong><ol>${list
        .map(
          (r, i) =>
            `<li id="src-${i + 1}">${r.url ? `<a href="${esc(r.url)}">${esc(r.title)}</a>` : esc(r.title)}</li>`,
        )
        .join('')}</ol></div>`
    : '';
  const note = s.rationale ? `<p class="editor-note">Editor's note: ${esc(s.rationale)}</p>` : '';
  const morgue = s.morgue?.length
    ? `<p class="morgue"><strong>From the morgue:</strong> ${s.morgue
        .map((m) => `${esc(m.headline)} <span class="ed">(${esc(m.editionId)})</span>`)
        .join('; ')}</p>`
    : '';
  const kicker = s.stopThePress ? '<p class="stop-kicker">🛑 Stop the Press</p>' : '';
  return `<article class="story${s.stopThePress ? ' stop-the-press' : ''}">
    ${kicker}
    <h3>${esc(s.headline)}</h3>
    ${s.standfirst ? `<p class="standfirst">${esc(s.standfirst)}</p>` : ''}
    <p class="byline">By ${esc(s.byline)}</p>
    <div class="body">${paragraphs(s.body, numberOf)}</div>
    ${sources}
    ${morgue}
    ${note}
  </article>`;
}

function paragraphs(body: string, numberOf: Map<string, number>): string {
  return body
    .split(/\n{2,}/)
    .map((p) => {
      // Escape first (citation tokens survive escaping intact), then turn each into a
      // superscript that links to the numbered source; unknown ids drop out of the prose.
      const withCites = esc(p.trim())
        .replace(CITE_RE, (_m, ids: string) => {
          const nums = citeNumbers(ids, numberOf);
          if (!nums.length) return '';
          return `<sup class="cite">${nums.map((n) => `<a href="#src-${n}">${n}</a>`).join(',')}</sup>`;
        })
        .replace(STRAY_CITE, '');
      return `<p>${tidy(withCites).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #d9d2c2; font-family: Georgia, 'Times New Roman', serif; color: #1a1712; }
.paper { max-width: 820px; margin: 0 auto; background: #f4efe2; padding: 2.5rem 2rem 3rem; box-shadow: 0 0 24px rgba(0,0,0,.25); }
.masthead { text-align: center; border-bottom: 3px double #1a1712; padding-bottom: .75rem; margin-bottom: 1.5rem; }
.masthead h1 { font-size: clamp(2.2rem, 6vw, 3.6rem); margin: 0; letter-spacing: .04em; font-weight: 900; }
.tagline { font-style: italic; margin: .25rem 0 0; color: #574f3f; }
.dateline { text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; margin: .6rem 0 0; }
section { margin: 1.75rem 0; }
section > h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .18em; border-bottom: 1px solid #1a1712; padding-bottom: .3rem; }
.page-one .story h3 { font-size: 1.9rem; }
.story { margin: 1.25rem 0; padding-bottom: 1rem; border-bottom: 1px solid #cdc4ae; }
.story h3 { margin: .2rem 0; line-height: 1.15; }
.standfirst { font-style: italic; color: #40382a; margin: .2rem 0 .6rem; }
.byline { text-transform: uppercase; letter-spacing: .1em; font-size: .68rem; color: #6a6250; margin: 0 0 .6rem; }
.body { columns: 1; }
.body p { margin: 0 0 .8rem; line-height: 1.5; text-align: justify; }
.sources { font-size: .74rem; color: #574f3f; margin: .6rem 0; }
.sources ol { margin: .3rem 0 0; padding-left: 1.4rem; }
.sources li { margin: .15rem 0; }
.sources a { color: #7a2d1d; }
sup.cite { font-size: .62em; line-height: 0; }
sup.cite a { text-decoration: none; color: #7a2d1d; font-weight: 700; }
sup.cite a::before { content: "["; }
sup.cite a::after { content: "]"; }
.morgue { font-size: .74rem; color: #574f3f; font-style: italic; }
.morgue .ed { color: #8a8270; font-style: normal; }
.editor-note { font-size: .8rem; font-style: italic; border-left: 3px solid #7a2d1d; padding-left: .6rem; color: #40382a; }
.stop-kicker { display: inline-block; background: #7a2d1d; color: #f4efe2; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; font-size: .7rem; padding: .2rem .5rem; margin: 0 0 .4rem; }
.story.stop-the-press { border-left: 4px solid #7a2d1d; padding-left: .8rem; }
.extra-banner { display: inline-block; background: #7a2d1d; color: #f4efe2; font-weight: 800; text-transform: uppercase; letter-spacing: .2em; font-size: .8rem; padding: .25rem .8rem; margin: 0 0 .5rem; }
.competing li, .briefs li, .corrections li, .editors-log li { margin: .3rem 0; line-height: 1.4; }
.colophon { border-top: 3px double #1a1712; margin-top: 2rem; padding-top: .8rem; font-size: .72rem; color: #6a6250; text-align: center; }
.colophon p { margin: 0 0 .5rem; }
/* The notice has to be readable, not hidden in the small print — it is the one thing on
   the page that is definitely true. */
.colophon .disclaimer { font-size: .8rem; line-height: 1.5; color: #4a4438; max-width: 46rem; margin: 0 auto .7rem; text-align: left; border-left: 3px solid #8a2f22; padding-left: .8rem; }
.colophon .disclaimer strong { color: #8a2f22; }
a { color: #7a2d1d; }
@media (min-width: 700px) { .page-one .body { columns: 2; column-gap: 1.6rem; } }
`;
