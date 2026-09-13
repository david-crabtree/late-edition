import { describe, expect, it } from 'vitest';
import { assertSafeId, paths } from './paths.js';

describe('edition ids and story slugs as directory names', () => {
  it('accepts what this program generates', () => {
    expect(assertSafeId('2026-09-10-001')).toBe('2026-09-10-001');
    expect(assertSafeId('watch-some-story-2026-09-10-001')).toBe('watch-some-story-2026-09-10-001');
    expect(paths('/n').storyDir('2026-09-10-001', 'a_story-slug')).toContain('a_story-slug');
  });

  it('refuses anything that could leave the editions folder', () => {
    for (const bad of ['..', '../x', 'a/b', 'a\\b', '-flag', '.hidden', '', 'a b', 'a\0b']) {
      expect(() => paths('/n').editionDir(bad), bad).toThrow(/Not a valid edition id/);
    }
    expect(() => paths('/n').storyDir('2026-09-10-001', '../../etc')).toThrow(/story slug/);
  });
});
