import { readFile } from 'node:fs/promises';
import type { Signal } from '../core/signal.js';
import { makeSignalId, shortHash } from '../core/signal.js';
import { clampText, filterUnseen, optNumber, optString } from './helpers.js';
import type { FetchContext, SourceAdapter, SourceConfig } from './types.js';

/**
 * Reads iCalendar (.ics) events from a URL or a local file — calendars, team schedules,
 * release plans. Emits one signal per new event. Hand-parsed (no dependency). Read-only.
 *
 * Config (one of url/path required):
 *   { id, type: 'ics', url?: 'https://…/cal.ics', path?: './team.ics',
 *     max?: number, includePast?: boolean }
 */
export const icsAdapter: SourceAdapter = {
  type: 'ics',
  displayName: 'iCalendar (.ics)',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const url = optString(source, 'url');
    const path = optString(source, 'path');
    const max = optNumber(source, 'max', 50);
    const includePast = Boolean(source.includePast);
    if (!url && !path) {
      throw new Error(`ics: source "${source.id}" needs a \`url\` or a \`path\`.`);
    }

    const text = url ? await fetchText(url) : await readFile(path as string, 'utf8');
    const events = parseEvents(unfold(text));

    const candidates: Signal[] = [];
    for (const ev of events) {
      const start = parseIcsDate(ev.DTSTART);
      if (!includePast && start && start.getTime() < ctx.now.getTime() - 86_400_000) continue;
      const key = ev.UID || `${ev.SUMMARY}-${ev.DTSTART}`;
      const hash = shortHash(source.id, key, ev.DTSTART ?? '');
      const whenLine = start
        ? `When: ${start.toISOString()}`
        : ev.DTSTART
          ? `When: ${ev.DTSTART}`
          : '';
      candidates.push({
        id: makeSignalId(source.id, hash),
        sourceId: source.id,
        sourceType: 'ics',
        timestamp: start?.toISOString() ?? ctx.now.toISOString(),
        title: ev.SUMMARY || '(untitled event)',
        body: clampText(
          [whenLine, ev.LOCATION ? `Where: ${ev.LOCATION}` : '', ev.DESCRIPTION ?? '']
            .filter(Boolean)
            .join('\n'),
        ),
        url: ev.URL,
        hash,
        meta: { uid: ev.UID, start: ev.DTSTART, end: ev.DTEND, location: ev.LOCATION },
      });
      if (candidates.length >= max) break;
    }

    return filterUnseen(ctx.state, candidates, { keep: 1000 });
  },
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'late-edition/0.0 (+ics)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ics: ${url} responded ${res.status}.`);
  return res.text();
}

/** Unfold RFC-5545 folded lines (continuation lines begin with a space or tab). */
function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

interface RawEvent {
  UID?: string;
  SUMMARY?: string;
  DTSTART?: string;
  DTEND?: string;
  LOCATION?: string;
  DESCRIPTION?: string;
  URL?: string;
}

function parseEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const rawKey = line.slice(0, colon);
      const value = unescapeIcs(line.slice(colon + 1));
      const key = rawKey.split(';')[0]?.toUpperCase(); // drop params like ;TZID=…
      if (key && key in FIELDS) current[FIELDS[key] as keyof RawEvent] = value;
    }
  }
  return events;
}

const FIELDS: Record<string, keyof RawEvent> = {
  UID: 'UID',
  SUMMARY: 'SUMMARY',
  DTSTART: 'DTSTART',
  DTEND: 'DTEND',
  LOCATION: 'LOCATION',
  DESCRIPTION: 'DESCRIPTION',
  URL: 'URL',
};

function unescapeIcs(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** Parse the common iCal date forms: 20260909, 20260909T130000, 20260909T130000Z. */
function parseIcsDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return undefined;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
