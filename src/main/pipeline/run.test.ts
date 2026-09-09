import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { paths } from '../store/paths.js';
import { runEdition } from './run.js';

let root: string;
let inbox: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'le-run-'));
  inbox = mkdtempSync(join(tmpdir(), 'le-inbox-'));
  scaffoldNewsroom(root);
  // Replace the sample beats with a single deterministic, offline folder beat.
  const beatsDir = paths(root).beatsDir;
  rmSync(join(beatsDir, 'the-wire.yaml'), { force: true });
  rmSync(join(beatsDir, 'the-codebase.yaml'), { force: true });
  writeFileSync(
    join(beatsDir, 'desk.yaml'),
    `id: customer_desk\nname: "Customer Desk"\nreporter: "Sam Vance"\nsources:\n  - id: inbox\n    type: folder\n    path: ${JSON.stringify(inbox)}\n    ext: ".txt"\n`,
  );
  writeFileSync(join(inbox, 'ticket-1.txt'), 'The export button is broken on Safari again.');
  writeFileSync(join(inbox, 'ticket-2.txt'), 'Please add a dark mode to the dashboard.');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(inbox, { recursive: true, force: true });
});

describe('runEdition (fake provider, offline)', () => {
  it('produces an edition with stories, files, and traceable sources', async () => {
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-09T12:00:00Z'),
    });

    expect(result.edition.stories.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);

    // Artefacts on disk.
    const md = readFileSync(join(result.editionDir, 'edition.md'), 'utf8');
    const html = readFileSync(join(result.editionDir, 'edition.html'), 'utf8');
    expect(md).toContain('The Daily Bit');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('The Daily Bit');

    // Every story's cited sources appear in the rendered paper (traceability).
    for (const story of result.edition.stories) {
      expect(story.sources.length).toBeGreaterThan(0);
      for (const ref of story.sources) {
        expect(md).toContain(ref.signalId);
      }
    }

    // Pipeline state reached completion.
    const pipeline = JSON.parse(readFileSync(join(result.editionDir, 'pipeline.json'), 'utf8'));
    expect(pipeline.stage).toBe('DONE');
  });

  it('runs a story as Competing Takes when two desks disagree', async () => {
    // Commission two angles on the beat; the fake provider makes the second desk contrarian.
    writeFileSync(
      join(paths(root).beatsDir, 'desk.yaml'),
      `id: customer_desk\nname: "Customer Desk"\nreporter: "Sam Vance"\nangles: 2\nsources:\n  - id: inbox\n    type: folder\n    path: ${JSON.stringify(inbox)}\n    ext: ".txt"\n`,
    );
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-09T12:00:00Z'),
    });
    const competing = result.edition.stories.filter(
      (s) => s.competingTakes && s.competingTakes.length > 1,
    );
    expect(competing.length).toBeGreaterThan(0);
    const takes = competing[0]?.competingTakes ?? [];
    const angles = new Set(takes.map((t) => t.angle));
    expect(angles.size).toBeGreaterThan(1); // the two takes genuinely differ

    const md = readFileSync(join(result.editionDir, 'edition.md'), 'utf8');
    expect(md).toContain('Competing Takes');
  });

  it('stops the press for an urgent, corroborated finding (promotes to page one)', async () => {
    writeFileSync(
      join(inbox, 'ticket-3.txt'),
      'SECURITY INCIDENT: customer data exposed via the export endpoint.',
    );
    const result = await runEdition({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-09T12:00:00Z'),
    });
    const stop = result.edition.stories.find((s) => s.stopThePress);
    expect(stop).toBeDefined();
    expect(stop?.placement).toBe('page_one');
    const md = readFileSync(join(result.editionDir, 'edition.md'), 'utf8');
    expect(md).toContain('STOP THE PRESS');
  });

  it('is idempotent on a second run: no new signals, no stories', async () => {
    await runEdition({ root, forceProvider: 'fake', now: new Date('2026-09-09T12:00:00Z') });
    // Second run: the folder adapter has already seen both tickets.
    const second = await runEdition({
      root,
      forceProvider: 'fake',
      now: new Date('2026-09-10T12:00:00Z'),
    });
    expect(second.edition.stories.length).toBe(0);
  });
});
