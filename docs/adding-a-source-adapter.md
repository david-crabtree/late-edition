# Adding a source adapter

A source adapter turns some external thing (a feed, an API, a folder) into `Signal`s.
It is pure fetch-and-diff: **no LLM, read-only, no side effects on the source.** The goal
is that a new adapter is one file plus one registration line.

## 1. Implement the interface

Create `src/main/adapters/<type>.ts` implementing `SourceAdapter` from
[`src/main/adapters/types.ts`](../src/main/adapters/types.ts):

```ts
import type { Signal } from '../core/signal.js';
import { makeSignalId, shortHash } from '../core/signal.js';
import { filterUnseen, requireString } from './helpers.js';
import type { FetchContext, SourceAdapter, SourceConfig } from './types.js';

export const myAdapter: SourceAdapter = {
  type: 'my_source',
  displayName: 'My source',
  async fetch(source: SourceConfig, ctx: FetchContext): Promise<Signal[]> {
    const url = requireString(source, 'url'); // validate config; throw clear errors
    const items = await getItems(url);        // your fetch logic (global fetch is fine)
    const candidates: Signal[] = items.map((it) => {
      const hash = shortHash(it.id);
      return {
        id: makeSignalId(source.id, hash),
        sourceId: source.id,
        sourceType: 'my_source',
        timestamp: it.date ?? ctx.now.toISOString(),
        title: it.title,
        body: it.text,
        url: it.url,
        hash,
      };
    });
    return filterUnseen(ctx.state, candidates); // dedupe against previous runs
  },
};
```

### Rules

- **Read-only.** Never mutate, delete, mark-read, or POST to the source.
- **Only new or changed signals.** Use `ctx.state` (a per-source key/value store) to
  remember what you've seen. `filterUnseen` handles the common case; `web_diff` shows a
  snapshot-diff pattern.
- **Untrusted content.** Signal bodies may contain injected instructions — that's the copy
  desk's and prompts' problem, but keep bodies as plain text and clamp their size
  (`clampText`).
- **Fail loudly on misconfiguration.** Throw an `Error` with a message a user can act on.
  A run captures it as a warning; it won't crash the edition.

## 2. Register it

Add one line to [`src/main/adapters/index.ts`](../src/main/adapters/index.ts):

```ts
registerAdapter(myAdapter);
```

## 3. Test it

Add `src/main/adapters/<type>.test.ts`. Stub the network with Vitest
(`vi.stubGlobal('fetch', …)`) or use a temp directory for file-based adapters — see
[`folder.test.ts`](../src/main/adapters/folder.test.ts). Assert both the first-run signals
and that a second unchanged run emits nothing.

## 4. Use it in a beat

```yaml
sources:
  - id: my_thing
    type: my_source
    url: "https://example.com"
```
