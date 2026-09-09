import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { paths } from '../store/paths.js';
import { runWatchOnce } from './run.js';

let root: string;
let watchDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'le-watch-'));
  watchDir = mkdtempSync(join(tmpdir(), 'le-watchdir-'));
  scaffoldNewsroom(root);
  const beatsDir = paths(root).beatsDir;
  rmSync(join(beatsDir, 'the-wire.yaml'), { force: true });
  rmSync(join(beatsDir, 'the-codebase.yaml'), { force: true });
  writeFileSync(
    join(beatsDir, 'wire.yaml'),
    `id: the_wire\nname: "The Wire"\nreporter: "Sam Vance"\ntripwires:\n  - match: "outage|breach"\n    regex: true\nsources:\n  - id: log\n    type: folder\n    path: ${JSON.stringify(watchDir)}\n    ext: ".txt"\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(watchDir, { recursive: true, force: true });
});

describe('runWatchOnce', () => {
  it('produces no extra when nothing trips a tripwire', async () => {
    writeFileSync(join(watchDir, 'ok.txt'), 'a normal, calm status update');
    const r = await runWatchOnce({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-09T12:00:00Z'),
    });
    expect(r.hits).toBe(0);
    expect(r.extra).toBeUndefined();
  });

  it('fires a Late Extra bulletin when a signal trips a tripwire', async () => {
    writeFileSync(join(watchDir, 'alert.txt'), 'Major service OUTAGE affecting customers.');
    const r = await runWatchOnce({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-09T12:00:00Z'),
    });
    expect(r.hits).toBeGreaterThan(0);
    expect(r.extra).toBeDefined();
    const md = readFileSync(join(r.extra!.dir, 'edition.md'), 'utf8');
    expect(md).toContain('LATE EXTRA');
    const ed = JSON.parse(readFileSync(join(r.extra!.dir, 'edition.json'), 'utf8'));
    expect(ed.lateExtra).toBe(true);
  });

  it('keeps its own seen-state: a second poll with no new files fires nothing', async () => {
    writeFileSync(join(watchDir, 'alert.txt'), 'Major service OUTAGE.');
    await runWatchOnce({ root, forceProvider: 'fake', now: new Date('2026-09-09T12:00:00Z') });
    const second = await runWatchOnce({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-09T12:05:00Z'),
    });
    expect(second.extra).toBeUndefined();
  });
});
