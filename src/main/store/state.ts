import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AdapterState } from '../adapters/types.js';

/**
 * File-backed {@link AdapterState}: one JSON file per source under `wire/.state/`.
 * Loaded once, mutated in memory, flushed with {@link FileAdapterState.flush}.
 */
export class FileAdapterState implements AdapterState {
  private data: Record<string, unknown>;
  private dirty = false;

  private constructor(
    private readonly file: string,
    data: Record<string, unknown>,
  ) {
    this.data = data;
  }

  static load(stateDir: string, sourceId: string): FileAdapterState {
    const file = join(stateDir, `${sanitize(sourceId)}.json`);
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      // No prior state — first run for this source.
    }
    return new FileAdapterState(file, data);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
    this.dirty = true;
  }

  delete(key: string): void {
    if (key in this.data) {
      delete this.data[key];
      this.dirty = true;
    }
  }

  flush(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    this.dirty = false;
  }
}

/** Keep source ids safe as filenames. */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}
