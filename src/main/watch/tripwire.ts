import type { BeatConfig, TripwireConfig } from '../config/types.js';
import type { Signal } from '../core/signal.js';

/** Does a signal trip a given tripwire? Keyword substring by default, regex when asked. */
export function signalTrips(signal: Signal, tw: TripwireConfig): boolean {
  if (tw.sources && tw.sources.length > 0 && !tw.sources.includes(signal.sourceId)) {
    return false;
  }
  const hay = `${signal.title}\n${signal.body}`;
  if (tw.regex) {
    try {
      return new RegExp(tw.match, 'i').test(hay);
    } catch {
      return false; // a bad regex never matches (and never throws mid-poll)
    }
  }
  return hay.toLowerCase().includes(tw.match.toLowerCase());
}

export interface TripwireHit {
  signal: Signal;
  tripwire: TripwireConfig;
}

/** All signals on a beat that trip at least one of its tripwires (deduped by signal id). */
export function beatHits(beat: BeatConfig, signals: Signal[]): TripwireHit[] {
  const tripwires = beat.tripwires ?? [];
  if (tripwires.length === 0) return [];
  const hits: TripwireHit[] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    for (const tw of tripwires) {
      if (signalTrips(signal, tw) && !seen.has(signal.id)) {
        seen.add(signal.id);
        hits.push({ signal, tripwire: tw });
        break;
      }
    }
  }
  return hits;
}
