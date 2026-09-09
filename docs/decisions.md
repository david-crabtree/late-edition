# Decisions

A running, honest log of choices made while building Late Edition — including things tried
that didn't work. Newest first within each milestone. Keyed to the build plan's `DECIDE`
markers where relevant.

## Milestone 0 — Skeleton

### D0.1 — Language & module system: TypeScript, ESM, strict
ESM (`"type": "module"`, `moduleResolution: NodeNext`) throughout, `strict` +
`noUncheckedIndexedAccess`. Node 20+ has stable global `fetch`, so no `axios`/`node-fetch`
dependency is needed for HTTP. Rationale: modern default, fewer deps.

### D0.2 — Lint & format: Biome instead of ESLint + Prettier
One fast, zero-config, free tool doing both lint and format, versus the traditional
ESLint + Prettier + plugins stack. Trade-off: ESLint is more familiar to some
contributors, but Biome's single-binary simplicity and speed win for a young repo. Revisit
if we need lint rules Biome lacks.

### D0.3 — Test runner: Vitest
Fast, ESM-native, Jest-compatible API. Playwright is deferred until there's a UI to smoke
(Milestone 3).

### D0.4 — Dev execution: tsx; build: tsc
`tsx` runs TypeScript directly for the CLI and dev loop; `tsc` handles typecheck and the
`dist/` build. No bundler yet — the headless core is plain Node modules. A renderer bundler
(electron-vite or similar) arrives with the UI in Milestone 3.

### D0.5 — Electron deferred to Milestone 3
The plan's Milestone 0 lists an "Electron + TypeScript scaffold", but Milestone 1 is
explicitly headless ("No UI"). Installing Electron (~200 MB) and wiring a renderer now
would slow installs and CI for a milestone that renders nothing. **Decision:** the source
tree is structured Electron-ready (`src/main/**` is framework-agnostic; a future
`src/renderer/**` and `src/app/main.ts` will host the window), but Electron itself is not a
dependency until the Newsroom UI lands. The CLI is the runnable deliverable through M1.
This favours "prefer the thing you learned" over the letter of the plan; non-negotiables
in §2 are untouched.

### D0.6 — SQLite morgue deferred; file-based adapter state for now
The `morgue.sqlite` index (better-sqlite3, a native module) is a rebuildable convenience
over the files, not a source of truth. For headless M1 we persist adapter "seen" state as
JSON alongside the wire, and skip the native build dependency. SQLite index arrives when
search/morgue UI needs it.

### D0.7 — Third-party libraries kept minimal
`yaml` (config), `rss-parser` (RSS/Atom), `cheerio` (readable-text extraction for
`web_diff`), `diff` (snapshot diffs). Everything else uses the Node standard library
(`fetch`, `child_process`, `fs`, `crypto`).

### D0.8 — npm audit: dev-only advisories left as-is
`npm audit` flags 5 issues (vitest/vite/esbuild dev server, path traversal / dev-server
request advisories). `npm audit --omit=dev` reports **0** — none are in shipped
dependencies. The fix is a breaking `vitest@5` bump; not worth it for a dev-server-only
advisory on a headless build. Revisit when upgrading the test stack.

## Milestone 1 — Headless paper

_(to be filled as adapters, providers and the pipeline land)_
