import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A single line in an edition's `log.jsonl`. The newsroom scene (later) is a view
 * over this log: animation subscribes to events rather than to pipeline internals.
 */
export interface LogEvent {
  ts: string;
  /** Pipeline stage or subsystem: 'WIRE' | 'REPORT' | 'reporter' | ... */
  stage: string;
  /** Short event type: 'stage_start' | 'stage_done' | 'signal' | 'error' | ... */
  event: string;
  /** Arbitrary structured detail. */
  [key: string]: unknown;
}

/** Append-only JSONL event log for one edition. */
export class EditionLog {
  constructor(private readonly file: string) {}

  emit(stage: string, event: string, detail: Record<string, unknown> = {}): void {
    const line: LogEvent = { ts: new Date().toISOString(), stage, event, ...detail };
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(line)}\n`, 'utf8');
  }
}
