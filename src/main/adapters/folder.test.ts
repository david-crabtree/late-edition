import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { folderAdapter } from './folder.js';
import type { AdapterState, FetchContext } from './types.js';

class MemState implements AdapterState {
  private m = new Map<string, unknown>();
  get<T>(k: string) {
    return this.m.get(k) as T | undefined;
  }
  set(k: string, v: unknown) {
    this.m.set(k, v);
  }
  delete(k: string) {
    this.m.delete(k);
  }
}

let dir: string;
let state: MemState;
const ctx = (): FetchContext => ({ state, now: new Date('2026-09-09T00:00:00Z') });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-folder-'));
  state = new MemState();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('folderAdapter', () => {
  it('emits new files, then nothing on an unchanged re-run', async () => {
    writeFileSync(join(dir, 'a.txt'), 'hello');
    writeFileSync(join(dir, 'b.txt'), 'world');

    const first = await folderAdapter.fetch({ id: 'inbox', type: 'folder', path: dir }, ctx());
    expect(first).toHaveLength(2);
    expect(first.every((s) => s.title.startsWith('New file'))).toBe(true);

    const second = await folderAdapter.fetch({ id: 'inbox', type: 'folder', path: dir }, ctx());
    expect(second).toHaveLength(0);
  });

  it('re-emits a file as Changed when its contents change', async () => {
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'v1');
    await folderAdapter.fetch({ id: 'inbox', type: 'folder', path: dir }, ctx());
    // Ensure mtime advances.
    writeFileSync(f, 'v2 with more content');
    const changed = await folderAdapter.fetch({ id: 'inbox', type: 'folder', path: dir }, ctx());
    expect(changed).toHaveLength(1);
    expect(changed[0]?.title).toContain('Changed file');
  });

  it('honours the ext filter', async () => {
    writeFileSync(join(dir, 'a.txt'), 'text');
    writeFileSync(join(dir, 'b.bin'), 'binary');
    const out = await folderAdapter.fetch(
      { id: 'inbox', type: 'folder', path: dir, ext: '.txt' },
      ctx(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain('a.txt');
  });

  it('throws a clear error when the directory does not exist', async () => {
    await expect(
      folderAdapter.fetch({ id: 'inbox', type: 'folder', path: join(dir, 'nope') }, ctx()),
    ).rejects.toThrow(/not an existing directory/);
  });
});
