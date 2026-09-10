import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import type { Edition } from '../core/edition.js';
import { runEdition } from '../pipeline/run.js';
import { paths } from '../store/paths.js';
import {
  MAX_PER_RUN,
  checkWatched,
  clearSpike,
  dropSource,
  listWatched,
  unwatch,
  watchEdition,
} from './field.js';

/** A page we can change between checks, so "did it notice" is a real question. */
let server: Server;
let base = '';
let pageBody = 'The price is £10.';

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body><main>${pageBody}</main></body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('the field desk', () => {
  let root: string;
  let editionId: string;

  /** File a real (offline) edition, then rewrite its sources to point at our test page. */
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'le-field-'));
    scaffoldNewsroom(root);
    pageBody = 'The price is £10.';
    const res = await runEdition({ root, forceProvider: 'fake', brief: 'the price of tea' });
    editionId = res.editionId;
    const file = join(paths(root).editionDir(editionId), 'edition.json');
    const ed = JSON.parse(readFileSync(file, 'utf8')) as Edition;
    const story = ed.stories[0];
    if (story) {
      story.sources = [
        { signalId: 'research:aaaaaaaaaaaa', title: 'The pricing page', url: `${base}/pricing` },
        { signalId: 'research:bbbbbbbbbbbb', title: 'No link here' },
      ];
      writeFileSync(file, JSON.stringify(ed), 'utf8');
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('turns a finished story’s sources into a watched beat', async () => {
    const r = await watchEdition(root, editionId);
    expect(r.watched).toBe(1);
    expect(r.skipped).toBe(1); // the source with no URL can't be polled
    const yaml = readFileSync(join(paths(root).beatsDir, `${r.beatId}.yaml`), 'utf8');
    // research: 0 is the whole economy of this feature — the digging is already done.
    expect(yaml).toContain('research: 0');
    expect(yaml).toContain('Ida Stringer');
    expect(await listWatched(root)).toHaveLength(1);
  });

  it('refuses a story with nothing to poll, rather than watching nothing', async () => {
    const file = join(paths(root).editionDir(editionId), 'edition.json');
    const ed = JSON.parse(readFileSync(file, 'utf8')) as Edition;
    if (ed.stories[0]) ed.stories[0].sources = [{ signalId: 'x', title: 'No link' }];
    writeFileSync(file, JSON.stringify(ed), 'utf8');
    await expect(watchEdition(root, editionId)).rejects.toThrow(/no page to watch|sources have/i);
  });

  // The point of the whole design: noticing is free.
  it('checks every watched page without spending a token', async () => {
    await watchEdition(root, editionId);
    const first = await checkWatched(root);
    expect(first.tokens).toBe(0);
    expect(first.beats).toHaveLength(1);

    // Unchanged page: nothing new on the spike.
    const second = await checkWatched(root);
    expect(second.moved).toBe(0);

    // Change it, and it gets noticed.
    pageBody = 'The price is £14. Effective immediately.';
    const third = await checkWatched(root);
    expect(third.moved).toBeGreaterThan(0);
    expect(third.tokens).toBe(0);
    const [beat] = await listWatched(root);
    expect(beat?.pending.length).toBeGreaterThan(0);
    expect(beat?.lastCheckedAt).toBeTruthy();
  });

  it('keeps what is on the spike until you deal with it', async () => {
    await watchEdition(root, editionId);
    await checkWatched(root);
    pageBody = 'The price is £14.';
    await checkWatched(root);
    const before = (await listWatched(root))[0];
    expect(before?.pending.length).toBeGreaterThan(0);

    // A later check that finds nothing must not quietly drop what you haven't read.
    await checkWatched(root);
    expect((await listWatched(root))[0]?.pending.length).toBe(before?.pending.length);

    const [b] = await listWatched(root);
    if (b) clearSpike(root, b.id);
    expect((await listWatched(root))[0]?.pending).toHaveLength(0);
  });

  it('leaves hand-written beats alone', async () => {
    mkdirSync(paths(root).beatsDir, { recursive: true });
    writeFileSync(
      join(paths(root).beatsDir, 'mine.yaml'),
      'id: mine\nname: "My own beat"\nsources: []\n',
      'utf8',
    );
    await watchEdition(root, editionId);
    const watched = await listWatched(root);
    expect(watched.map((w) => w.id)).not.toContain('mine');
    expect(unwatch(root, 'mine')).toBe(false);
  });

  it('stops watching on request', async () => {
    const r = await watchEdition(root, editionId);
    expect(unwatch(root, r.beatId)).toBe(true);
    expect(await listWatched(root)).toHaveLength(0);
  });
});

describe('working a case', () => {
  let root: string;
  let editionId: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'le-case-'));
    scaffoldNewsroom(root);
    pageBody = 'The price is £10.';
    const res = await runEdition({ root, forceProvider: 'fake', brief: 'the price of tea' });
    editionId = res.editionId;
    const file = join(paths(root).editionDir(editionId), 'edition.json');
    const ed = JSON.parse(readFileSync(file, 'utf8')) as Edition;
    if (ed.stories[0]) {
      ed.stories[0].sources = [
        { signalId: 'research:aaaaaaaaaaaa', title: 'One', url: `${base}/one` },
        { signalId: 'research:bbbbbbbbbbbb', title: 'Two', url: `${base}/two` },
        { signalId: 'research:cccccccccccc', title: 'Three', url: `${base}/three` },
      ];
      writeFileSync(file, JSON.stringify(ed), 'utf8');
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('drops one source and leaves the rest of the case standing', async () => {
    const c = await watchEdition(root, editionId);
    const before = (await listWatched(root))[0];
    const victim = before?.sources[1];
    const r = await dropSource(root, c.beatId, String(victim?.id));
    expect(r).toMatchObject({ ok: true, remaining: 2, caseDropped: false });
    const after = (await listWatched(root))[0];
    expect(after?.sources.map((s) => s.id)).not.toContain(victim?.id);
    expect(after?.sources).toHaveLength(2);
    expect(after?.name).toBe(before?.name); // the case survives its own edit
  });

  it('drops the case when the last source goes, rather than leaving an empty one', async () => {
    const c = await watchEdition(root, editionId);
    const ids = ((await listWatched(root))[0]?.sources ?? []).map((s) => s.id);
    for (const id of ids.slice(0, -1)) await dropSource(root, c.beatId, id);
    const last = await dropSource(root, c.beatId, String(ids.at(-1)));
    expect(last.caseDropped).toBe(true);
    expect(await listWatched(root)).toHaveLength(0);
  });

  it('says no to a source that is not on the case', async () => {
    const c = await watchEdition(root, editionId);
    expect(await dropSource(root, c.beatId, 'nope')).toMatchObject({ ok: false });
    expect((await listWatched(root))[0]?.sources).toHaveLength(3);
  });

  // The cost guard. A case ignored for a month must not turn into the week's biggest run.
  it('caps how many changes one follow-up reports on', async () => {
    expect(MAX_PER_RUN).toBeLessThanOrEqual(20);
    expect(MAX_PER_RUN).toBeGreaterThan(0);
  });
});
