import { describe, expect, it } from 'vitest';
import { assertFetchableUrl, fetchText } from './helpers.js';

describe('the URLs an adapter may read', () => {
  it('allows ordinary http and https addresses', () => {
    expect(assertFetchableUrl('https://example.com/feed.xml', 't').hostname).toBe('example.com');
    expect(assertFetchableUrl('http://example.com/', 't').protocol).toBe('http:');
  });

  it('refuses other schemes', () => {
    for (const u of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ftp://x/',
      'data:text/plain,x',
    ]) {
      expect(() => assertFetchableUrl(u, 't'), u).toThrow(/only http and https|not a URL/);
    }
    expect(() => assertFetchableUrl('not a url', 't')).toThrow(/not a URL/);
  });

  it('refuses this machine and private networks', () => {
    for (const u of [
      'http://localhost:11434/api',
      'http://foo.localhost/',
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://169.254.169.254/latest/meta-data',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
    ]) {
      expect(() => assertFetchableUrl(u, 't'), u).toThrow(/local or private/);
    }
    expect(() => assertFetchableUrl('http://172.32.0.1/', 't')).not.toThrow();
  });

  it('lets a user-configured source point at a private address', () => {
    expect(
      assertFetchableUrl('http://192.168.1.10/wiki', 't', { allowPrivate: true }).hostname,
    ).toBe('192.168.1.10');
    expect(() => assertFetchableUrl('file:///x', 't', { allowPrivate: true })).toThrow(/only http/);
  });

  it('honours the escape hatch for adopted URLs', () => {
    process.env.LATE_EDITION_ALLOW_LOCAL_URLS = '1';
    try {
      expect(() => assertFetchableUrl('http://127.0.0.1/', 't')).not.toThrow();
    } finally {
      delete process.env.LATE_EDITION_ALLOW_LOCAL_URLS;
    }
  });
});

describe('fetchText', () => {
  it('stops reading at the byte cap even when Content-Length is absent', async () => {
    const big = new Uint8Array(4096).fill(97);
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            c.enqueue(big);
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      await expect(
        fetchText('https://example.com/endless', 't', { maxBytes: 10_000 }),
      ).rejects.toThrow(/exceeded the 10000-byte limit/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('never calls fetch for a refused scheme', async () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('x');
    }) as typeof fetch;
    try {
      await expect(fetchText('file:///etc/passwd', 't')).rejects.toThrow(/only http/);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
