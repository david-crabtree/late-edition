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

## The Morgue + ics adapter

### DM.1 — Morgue is a dependency-free file scan, not SQLite (yet)
The archive/search (plan "The Morgue") is built by scanning `editions/*/edition.json` on
demand — no `better-sqlite3` native dependency (which also wouldn't build under this
environment's blocked install scripts). `late-edition search <query>` ranks headline
matches by term overlap; at CHECK, each story is linked to related past coverage
(shared significant terms + same beat) and the paper renders a "From the morgue" line.
A SQLite index can back this later without changing the interface if scan cost matters.

### DM.2 — ics adapter is hand-parsed (no calendar dependency)
The sixth source adapter (`ics`, for calendars / "City Hall") parses iCalendar by hand —
line-unfolding, VEVENT extraction, the common DTSTART date forms — rather than pulling a
calendar library, keeping the zero-added-dependency posture. Past events are filtered out
by default. `imap` (the remaining v1 adapter) is left for later: it needs a real IMAP
dependency and a live server to verify meaningfully; the `folder` adapter already covers a
support-export inbox in the meantime.

## Milestone 4 — Stop the press & Late Extras (headless slice)

_The interactive interrupt card (run it / fold it / not news) and the press-room animation
are UI, deferred with M3. The mechanics underneath are headless and shipped here._

### D4.1 — Stop the press = urgency ≥ threshold AND corroborated → auto-promote
At CHECK (after the copy desk has run), a story whose max reporter urgency clears the
beat's threshold (`urgency_threshold`, per-beat or the `edition.urgencyThreshold` default of
0.85) **and** is corroborated (copy desk `pass` and no injection flags) is promoted to page
one with a "STOP THE PRESS" kicker, plus an Editor's Log note and a logged event. Headless
has no interactive card, so it auto-promotes rather than pausing; the interactive
run/fold/not-news choice is a UI feature. The fake provider rates genuinely alarming signals
(security/incident/outage/…) as urgent so this is demonstrable and testable offline.

### D4.2 — Late Extras: tripwires + a `watch` poll, with separate seen-state
`beat.tripwires` (keyword or regex, optionally source-scoped) are checked by
`late-edition watch` (`--once`, or looping every `--interval` seconds). A tripped signal
fires a one-off **Late Extra** bulletin — a full edition marked `lateExtra` with a masthead
banner — built by reusing the pipeline stages (ASSIGN→CHECK) on the matched signals only.
Watchers keep their **own** adapter seen-state (`wire/.watch-state`) so a Late Extra never
consumes a signal the daily edition would otherwise report. Distribution/scheduling of the
loop as a real daemon (node-cron, tray) arrives with the app; the CLI loop is the headless
stand-in.

### D2.4 — Prompt overrides are opt-in, not pre-copied
Reversed part of D1.7: `init` no longer copies the prompt templates into each newsroom
(they went stale when the built-in defaults improved). Instead it writes a
`newsroom/prompts/README.md` explaining that a `<role>.md` dropped there overrides the
built-in. Newsrooms now track the latest prompts automatically and stay customisable.

## Researcher tier (the "not paper thin" pass)

### DR.1 — A RESEARCH stage between ASSIGN and REPORT
The original chain topped out at reporters, who only saw pre-scraped `Signal`s — so a
`--brief "<topic>"` run had exactly one signal (the topic string) and the reporter wrote
from model memory. That's the paper-thin failure mode. Added a **RESEARCH** stage: one or
more researcher agents dig up sourced findings on the story's topic *before* the reporters
write. This makes the org the four tiers we actually want — **researchers → reporters →
copywriters (rewrite desk) → editors (managing editor + copy desk)** — with each tier still
mapped to its own provider in `staff.yaml`.

### DR.2 — Findings ARE signals (reuse, don't fork the pipeline)
A researcher returns a `ResearchDossier` (`findings[]` with `title`/`summary`/`url`/…). Each
finding is converted to a normal `Signal` (`sourceType: 'research'`, id
`research:<hash>`) and folded into the story's signals + the wire archive. Consequence: the
copy-desk citation check, the morgue, and the paper renderer all work **unchanged** — a URL
a researcher never actually found can't reach the paper, because the deterministic copy desk
already verifies every `[sourceId:hash]` citation resolves to a real signal. This was the
big lever: one contract + a converter instead of a parallel "research" code path.

### DR.3 — No invented CLI flags for web tools; lean on the agent + warn
`docs/providers-research.md` verifies **no** web-tool/permission flags for any CLI, and the
repo rule is "never invent flags". So the engine does **not** hard-code `--allowedTools`
etc. Researchers run on an agentic CLI that browses natively (the prompt tells them to use
their web tools and return real URLs); providers whose `capabilities.webSearch` is false
(`fake`, one-shot `directapi`, most `ollama`) still run but the stage pushes a warning that
findings may be model-memory only. Wiring a verified per-CLI web flag later is a one-file,
per-provider change.

### DR.4 — Efficiency defaults (research is the token-hungry tier)
Research is **off by default for source-backed beats** (opt in with `research: N` per beat)
and **on (1 pass) by default for a `--brief` topic**, since a bare topic needs digging.
`--research <n>` overrides per run (0 disables entirely). Findings are capped per story
(`maxFindings`, default 8) to bound downstream tokens, and the scaffold points the
researcher desk at a *cheaper* model. Research spend counts toward the existing `--cap`
token budget and is attributed to a `researcher` role in the reel ledger.
