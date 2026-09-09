import type { Edition } from '../core/edition.js';

/** A compact plain-text summary of an edition for chat channels. */
export function textSummary(ed: Edition): string {
  const lines: string[] = [];
  lines.push(`${ed.paperName} — No. ${ed.number} · ${new Date(ed.date).toDateString()}`);
  if (ed.weatherLine) lines.push(ed.weatherLine);
  lines.push('');
  const pageOne = ed.stories.filter((s) => s.placement === 'page_one');
  const rest = ed.stories.filter((s) => s.placement !== 'page_one');
  for (const s of pageOne) lines.push(`★ ${s.headline}${s.standfirst ? ` — ${s.standfirst}` : ''}`);
  for (const s of rest) lines.push(`• ${s.headline}`);
  if (ed.briefs.length) lines.push(`Briefs: ${ed.briefs.length}`);
  const competing = ed.stories.filter((s) => s.competingTakes && s.competingTakes.length > 1);
  if (competing.length)
    lines.push(`Competing Takes: ${competing.map((s) => s.headline).join('; ')}`);
  return lines.join('\n').trim();
}

/** Just the headlines, for feeds and short cards. */
export function headlines(ed: Edition): string[] {
  return ed.stories.map((s) => s.headline);
}
