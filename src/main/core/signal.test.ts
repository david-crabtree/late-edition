import { describe, expect, it } from 'vitest';
import { hashContent, makeSignalId, shortHash } from './signal.js';

describe('signal hashing', () => {
  it('hashContent is stable and deterministic', () => {
    expect(hashContent('a', 'b')).toBe(hashContent('a', 'b'));
    expect(hashContent('a', 'b')).not.toBe(hashContent('b', 'a'));
  });

  it('treats undefined parts as empty', () => {
    expect(hashContent('a', undefined)).toBe(hashContent('a'));
  });

  it('shortHash is a 12-char prefix of the full hash', () => {
    const full = hashContent('hello');
    expect(shortHash('hello')).toBe(full.slice(0, 12));
    expect(shortHash('hello')).toHaveLength(12);
  });

  it('makeSignalId combines source id and a truncated hash', () => {
    const id = makeSignalId('feed-1', hashContent('item'));
    expect(id.startsWith('feed-1:')).toBe(true);
    expect(id.split(':')[1]).toHaveLength(12);
  });
});
