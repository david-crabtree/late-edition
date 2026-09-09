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

### D1.1 — Verified CLI syntax before writing providers
Per the plan's VERIFY policy, the real provider invocations were researched against
official docs first and recorded in `docs/providers-research.md` (dated). Implemented
invocations: Claude `claude -p … --output-format json` (text in `.result`); Gemini
`gemini -p … --output-format json` (text in `.response`); Codex `codex exec --sandbox
read-only --ask-for-approval never --output-last-message <file>` (read the file); OpenCode
`opencode run --quiet` (plain stdout — its JSON event schema is unverified); Ollama HTTP
`/api/generate` (text in `.response`); plus a direct-API provider (OpenAI-compatible +
Anthropic Messages). Unverified flags (e.g. `--version` on some tools) are used only for a
best-effort liveness probe that treats a non-ENOENT failure as "installed".

### D1.2 — One universal prompt channel (no per-CLI system-prompt flags)
Not every CLI exposes a separate system-prompt flag, and inventing flags is against
policy, so a job's system guidance and user materials are composed into a single prompt
string (`composePrompt`). The direct-API provider, which has real message roles, uses them.

### D1.3 — Providers return model text; the pipeline owns JSON parsing
Each provider extracts the model's final text from its own envelope and returns that. The
pipeline asks for JSON where needed and parses defensively (`extractJson`: strips fences,
brace-matches, retries once with the parse error appended). This keeps providers simple and
the JSON contract in one place (`pipeline/contracts.ts`).

### D1.4 — Pipeline is an explicit, resumable state machine
`EditionDraft.stage` walks WIRE→…→PRESS→DONE; the draft is persisted to
`editions/<id>/pipeline.json` after every transition, and `run --resume <id>` continues
from the last completed stage. Per-item failures (a broken source, a reporter that errors)
are captured as `warnings` so one bad input can't sink the edition; only role-resolution or
render failures are fatal.

### D1.5 — Assignment model for M1 (single angle)
One provisional story per beat that produced ≥1 new signal. The managing editor sets
placement (page_one / below_fold / brief / spike); spiked stories leave the run, brief ones
render as one-line Briefs. Multiple angles, Competing Takes and provider-mixing are wired in
the data model but exercised in M2.

### D1.7 — Prompt templates: code defaults, per-newsroom overrides
The plan puts prompts in `prompts/<role>.md`. To avoid a repo copy drifting from the code,
the built-in templates live in `src/main/pipeline/prompts.ts` as the source of truth and are
**scaffolded into each newsroom** at `newsroom/prompts/<name>.md` by `init`, where users edit
them; `loadPrompt` prefers a newsroom override over the built-in. This satisfies "editable
templates" while keeping one source of truth. Versioned fixtures (plan §9.5) arrive with M2's
copy-desk work.

### D1.6 — Renderer lives in `main/paper`, shared by CLI and (later) the UI
`renderMarkdown` / `renderHtml` are pure functions over an `Edition`. The HTML is a
self-contained newspaper page with an inlined noir palette and system serif — no external
fonts or assets — so it works offline and as a future static export.

## Milestone 2 — Angles and the call

### D2.1 — Reporter pool: N angles, optional provider mixing
`resolveReporterPool` returns one reporter per commissioned angle (`beat.angles`, 1-3).
With `mix_providers: true` and more than one provider configured in staff.yaml, the angles
come from **different** providers (distinct ids across all desk assignments, base first);
otherwise the same desk is repeated. A forced provider (`--provider`) can't be mixed. Each
desk gets a distinct **angle directive** (first desk = straight read; later desks = "you
are an independent second desk, find the overlooked/contrarian take"), which makes real
models diverge and lets the offline fake provider produce a deterministic disagreement for
tests. When mixing is asked for but only one provider is available, we warn and fall back to
directive-only variation rather than failing.

### D2.2 — Disagreement is surfaced, never silently merged
After the editor's call, `detectDisagreement` (distinct normalized angles, or a confidence
spread ≥ 0.25 across reports) forces `competingTakes` on even if the editor didn't set it,
and lifts the story off "brief"/"spike". The renderer then runs a **Competing Takes** box
showing each desk's take side by side. This is the trust feature from the plan (§4.4/§12).

### D2.3 — Copy desk = deterministic check ∪ LLM check
Every `[signalId]` cited in the final copy must resolve to a real signal for that story.
`verifyCopyCitations` enforces this deterministically (regex over the copy, set-membership
against the story's signals) — it runs even when the LLM copy desk is weak or unavailable,
and it catches citations/links injected by source material. The LLM `CopyCheck` is merged
in; the deterministic result wins on `pass`. Unsupported citations become **Corrections**
with the reporter's name.

## Milestone 5 — Distribution (headless channels)

_Taken before M3/M4 because it's fully headless and it's the point of the whole thing —
getting the paper to a team that doesn't run the app. M3 (Electron UI) is deferred while
we stay headless._

### D5.1 — Distribution is opt-in; secrets never touch yaml
Channels only run when the user passes `--distribute` (or sets `auto_send: true`), matching
the plan's "explicit approval per edition by default". Each channel names an **environment
variable** that holds its webhook/URL (`webhook_env`, `url_env`) rather than storing the
secret in `config.yaml`. OS-keychain storage (keytar) arrives with the UI; the env-var
indirection is the headless stand-in and keeps secrets out of the repo.

### D5.2 — Channels ship: slack, teams, webhook, rss; a `--dry-run` previews sends
One-file channels behind a `Channel` interface + registry (mirrors the adapter/provider
pattern). Slack/Teams/generic-webhook POST via global `fetch`; RSS writes
`editions/feed.xml` (RSS 2.0) so a team can subscribe with any reader — with `base_url` the
item links point at hosted HTML, without it at the local file. Every channel handles its own
failure (never throws) so one bad webhook can't block the rest, and `--dry-run` prints
exactly what would be sent without sending. Email/SMTP and clipboard are deferred:
SMTP needs the keychain for credentials, and clipboard is UI-adjacent.

### D2.4 — Prompt overrides are opt-in, not pre-copied
Reversed part of D1.7: `init` no longer copies the prompt templates into each newsroom
(they went stale when the built-in defaults improved). Instead it writes a
`newsroom/prompts/README.md` explaining that a `<role>.md` dropped there overrides the
built-in. Newsrooms now track the latest prompts automatically and stay customisable.
