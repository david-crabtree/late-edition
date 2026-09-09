import { describe, expect, it } from 'vitest';
import { extractJson } from './json.js';

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    const text = '```json\n{"ok": true}\n```';
    expect(extractJson<{ ok: boolean }>(text)).toEqual({ ok: true });
  });

  it('finds an object buried in prose', () => {
    const text = 'Sure! Here is the result:\n{"headline": "Hi"}\nHope that helps.';
    expect(extractJson<{ headline: string }>(text)).toEqual({ headline: 'Hi' });
  });

  it('handles braces inside strings', () => {
    const text = 'noise {"msg": "a } b { c"} tail';
    expect(extractJson<{ msg: string }>(text)).toEqual({ msg: 'a } b { c' });
  });

  it('throws when there is no JSON object', () => {
    expect(() => extractJson('just words, no object')).toThrow();
  });
});
