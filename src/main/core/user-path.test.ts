import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUserPath, wellKnownBinDirs } from './user-path.js';

/**
 * The bug: Claude Code installs itself to `~/.local/bin`, and an app launched from Finder
 * on macOS is handed roughly `/usr/bin:/bin:/usr/sbin:/sbin`. So somebody can install an
 * agent, sign in, watch it answer in their terminal, and the app still reports it as not
 * installed — with nothing on screen to explain why, because from where the app is
 * standing the command really is not there.
 */
describe('the PATH a GUI app is handed', () => {
  /** What macOS actually gives an app opened from Finder. */
  const FINDER = '/usr/bin:/bin:/usr/sbin:/sbin';
  const HOME = '/Users/davidcrabtree';
  const opts = (extra: Record<string, unknown> = {}) => ({
    platform: 'darwin' as NodeJS.Platform,
    shell: undefined, // no login shell in a test; the well-known list has to carry it
    home: HOME,
    exists: () => true,
    ...extra,
  });

  it('finds where Claude Code installs itself', () => {
    const out = resolveUserPath(FINDER, opts()).split(':');
    expect(out).toContain(join(HOME, '.local', 'bin'));
  });

  it('finds Homebrew on both Apple Silicon and Intel', () => {
    const out = resolveUserPath(FINDER, opts()).split(':');
    expect(out).toContain('/opt/homebrew/bin');
    expect(out).toContain('/usr/local/bin');
  });

  it('keeps everything it was given, in order', () => {
    const out = resolveUserPath(FINDER, opts()).split(':');
    expect(out.slice(0, 4)).toEqual(FINDER.split(':'));
  });

  it('adds nothing twice', () => {
    const already = `${FINDER}:${join(HOME, '.local', 'bin')}`;
    const out = resolveUserPath(already, opts()).split(':');
    expect(out.filter((d) => d === join(HOME, '.local', 'bin'))).toHaveLength(1);
  });

  it('adds only directories that exist', () => {
    const only = join(HOME, '.local', 'bin');
    const out = resolveUserPath(FINDER, opts({ exists: (p: string) => p === only })).split(':');
    expect(out).toContain(only);
    expect(out).not.toContain('/opt/homebrew/bin');
  });

  // Windows hands a launched process the real PATH, so there is nothing to repair and
  // guessing at directories would only add noise.
  it('leaves Windows alone', () => {
    const win = 'C:\\Windows\\system32;C:\\Windows';
    expect(resolveUserPath(win, opts({ platform: 'win32' }))).toBe(win);
  });

  it('survives having no PATH at all', () => {
    expect(resolveUserPath(undefined, opts()).length).toBeGreaterThan(0);
    expect(resolveUserPath('', opts()).length).toBeGreaterThan(0);
  });

  it('lists somewhere for each of the common installers', () => {
    const dirs = wellKnownBinDirs(HOME);
    expect(dirs).toContain(join(HOME, '.local', 'bin'));
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs.every((d) => d.length > 0)).toBe(true);
  });
});
