import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Signal } from '../core/signal.js';
import { paths } from './paths.js';

/**
 * Archive of raw signals as they come off the adapters, before anyone looks at
 * them. One append-only JSONL file. The pipeline reads signals directly from the
 * adapter run; this is the durable record (and future morgue input).
 */
export function appendToWire(root: string, signals: Signal[]): void {
  if (signals.length === 0) return;
  const p = paths(root);
  mkdirSync(p.wireDir, { recursive: true });
  const file = join(p.wireDir, 'signals.jsonl');
  const seen = readWireIds(file);
  const fresh = signals.filter((s) => !seen.has(s.id));
  if (fresh.length === 0) return;
  const lines = fresh.map((s) => JSON.stringify(s)).join('\n');
  appendFileSync(file, `${lines}\n`, 'utf8');
}

function readWireIds(file: string): Set<string> {
  const ids = new Set<string>();
  try {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        ids.add((JSON.parse(line) as Signal).id);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // no wire yet
  }
  return ids;
}
