import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadNewsroom } from '../config/newsroom.js';
import { scaffoldNewsroom } from '../config/scaffold.js';
import { paths } from '../store/paths.js';
import { resolveCopyDesk, resolveEditor, resolveReporter } from './agents.js';
import { runEdition } from './run.js';
import { StaffNotConfiguredError, isUnstaffed } from './staffing.js';

describe('an unstaffed desk stops the edition', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-staffing-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('scaffolds every desk unset rather than on the offline stand-in', () => {
    const yaml = readFileSync(paths(root).staffFile, 'utf8');
    expect(yaml).toContain('provider: unset');
    expect(yaml).not.toMatch(/^\s*(managing_editor|copy_desk|\s+default):\s*\{ provider: fake \}/m);
  });

  it('names the empty desk instead of inventing a paper', async () => {
    const nr = await loadNewsroom(root);
    for (const resolve of [resolveEditor, resolveCopyDesk]) {
      expect(() => resolve(nr)).toThrow(StaffNotConfiguredError);
    }
    expect(() => resolveReporter(nr, 'brief')).toThrow(/No agent is set for the reporters/);
  });

  it('still runs when a provider is forced, so a dry run needs no wiring', async () => {
    const res = await runEdition({ root, forceProvider: 'fake', brief: 'a topic', research: 0 });
    expect(res.edition.stories.length).toBeGreaterThan(0);
  });

  it('treats blank, unset and none as nobody', () => {
    expect(isUnstaffed('')).toBe(true);
    expect(isUnstaffed('unset')).toBe(true);
    expect(isUnstaffed(' None ')).toBe(true);
    expect(isUnstaffed(undefined)).toBe(true);
    expect(isUnstaffed('claude')).toBe(false);
  });
});
