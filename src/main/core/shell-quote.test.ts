import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { shellQuote } from './shell-quote.js';

/**
 * The bug this exists for: the default newsroom on macOS sits under
 * `~/Library/Application Support/late-edition/newsroom`, that path was written unquoted
 * into a command handed to Terminal.app, and zsh read the space as an argument separator.
 * `cd` failed on `/Users/…/Library/Application` and the command the terminal had been
 * opened for never ran. Found by opening the app on a real Mac.
 */
describe('quoting a path for a shell', () => {
  it('survives the path that caused this', () => {
    const p = '/Users/davidcrabtree/Library/Application Support/late-edition/newsroom';
    expect(shellQuote(p)).toBe(`'${p}'`);
  });

  it('handles the characters a shell would otherwise act on', () => {
    for (const p of [
      '/tmp/a b',
      '/tmp/a$b',
      '/tmp/a`b`',
      '/tmp/a;rm -rf /',
      '/tmp/a&&b',
      '/tmp/a|b',
      '/tmp/a\\b',
      '/tmp/a"b"',
      '/tmp/a\nb',
    ]) {
      // Single quotes are literal in a POSIX shell, so the only thing that needs work is
      // a single quote itself — everything else is inert inside them.
      expect(shellQuote(p)).toBe(`'${p}'`);
    }
  });

  it('closes, escapes and reopens around a single quote', () => {
    expect(shellQuote("/tmp/it's here")).toBe(`'/tmp/it'\\''s here'`);
  });

  // The only check that really settles it: hand the result to a shell and see what it gets.
  it.skipIf(process.platform === 'win32')('round-trips through a real shell', () => {
    for (const p of [
      '/Users/x/Library/Application Support/late-edition/newsroom',
      "/tmp/it's here",
      '/tmp/a$b `c` "d"',
    ]) {
      const out = execFileSync('sh', ['-c', `printf %s ${shellQuote(p)}`], { encoding: 'utf8' });
      expect(out).toBe(p);
    }
  });
});
