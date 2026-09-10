# How Late Edition is put together

Everything you need to work on this without reading the whole tree first. Trust the code
over this document where they disagree, and fix the document when you find a disagreement.

## The shape of it

Two halves that don't know much about each other:

- **The engine** (`src/main/`) is a headless TypeScript library. It takes a topic, runs a
  multi-agent pipeline over your own sources, and writes a newspaper to disk. The CLI
  (`src/cli/`) is a thin wrapper over it.
- **The app** (`src/electron/`) is an Electron shell that calls the same engine in-process
  and animates it. Its entire interface is one self-contained HTML file.

The app files editions two ways: from a topic you type, and as a follow-up on a **case** the
field desk is watching. Standing assignments on a cadence, tripwires, distribution and
searching the archive exist and are tested, but only in the CLI.

Nothing runs on a server. There is no service to sign up for. Agents run on the user's own
machine under their own accounts.

## The pipeline

An edition moves through explicit stages, and every stage writes files, so a crashed or
interrupted run resumes from where it stopped.

```
WIRE → ASSIGN → TRIAGE → RESEARCH → REPORT → ANGLES → CALL → WRITE → CHECK → PROOF → PRESS
```

- **WIRE** runs the source adapters (`rss`, `git_local`, `github`, `web_diff`, `folder`,
  `ics`). Pure fetch-and-diff, no model involved. Each one emits `Signal`s.
- **ASSIGN** resolves which agent takes each desk. An unstaffed desk stops here.
- **TRIAGE** is the Chief reading a free-text brief. Too vague, and the run pauses with
  questions rather than guessing.
- **RESEARCH** digs up sourced findings. Every finding becomes a `Signal` with an id, which
  is what makes the citation contract enforceable later.
- **REPORT** commissions one to three reporters per story, ideally on different agents,
  because they disagree in useful ways. A desk that doesn't trust its own reporting can
  stop here and ask.
- **ANGLES / CALL** are the editor choosing a line, or running Competing Takes when the
  reporters genuinely disagree rather than silently merging them.
- **WRITE** turns the chosen angle into copy, in whatever format was asked for. The picture
  desk runs here too, when it's switched on.
- **CHECK** is the copy desk verifying every claim resolves to a real cited signal.
  Anything that doesn't is cut and listed under Corrections.
- **PROOF / PRESS** assemble and render the paper.

`src/main/pipeline/run.ts` holds the state machine; `stages.ts` holds the stages.

## The contracts worth protecting

Three things hold this together. Breaking any of them makes the output worthless, so they
have tests and they are worth reading before changing prompts or rendering.

**Citations resolve or they die.** An agent cites by writing a signal's id verbatim
(`[research:1a2b3c4d5e6f]`). Only literal, existing ids resolve to a numbered footnote.
Invented markers like `[#1]` or `[ref]` are scrubbed from the prose by the renderer. This is
why a story can't cite a source the researcher never found.

**Format changes the voice, never the facts.** `src/main/core/formats.ts` holds the shapes
(newspaper story, LinkedIn post, Reddit post, blog post, newsletter blurb, plain brief),
tones and
lengths. Every one of them carries the citation rules through unchanged.

**A desk with no agent stops the run.** Desks scaffold `unset`. An empty one throws
`StaffNotConfiguredError` naming the desk, rather than falling back to the offline stand-in
and filling the paper with invented copy under an unsuspecting user's nose.

## Agents

`src/main/providers/` — one file per provider, each declaring how to detect itself, how to
run a job, which models it has, and which of them suits each desk.

| Provider | State |
| --- | --- |
| `claude` | Proven end to end on real editions. |
| `codex`, `gemini`, `opencode`, `ollama`, `directapi` | Written and detected, not yet confirmed against a live CLI. Surfaced in Setup as untested. |
| `fake` | The offline stand-in. Not an agent — a dry run. Hidden from Setup unless explicitly asked for, because its output is entirely invented. |

Auth is never stored here. It lives in each agent's own CLI. Setup writes `staff.yaml`,
which says which provider and model runs each desk, and nothing else.

Six desks make their own agent call: triage (on the editor's desk), researcher, reporter,
writer, editor and copy desk, plus the picture desk when it's switched on. The picture desk
falls back to the writers when `photo_desk` is unset. **The field desk is not one of them** —
Ida is the byline on a follow-up, which runs on the ordinary desks.

**On Windows**, agent CLIs install as `.cmd` shims, so `execFile('claude')` fails with
ENOENT. `providers/cli.ts` wraps calls through `cmd.exe /c`. Don't undo that.

## The app

`src/electron/main.ts` is the ESM main process. It owns the newsroom folder (persisted in
`le-config.json` under the user's app data) and every IPC handler.

`src/electron/preload.cjs` is **CommonJS on purpose** — ESM preloads don't load reliably in
Electron, and a missing preload silently drops the app into demo mode with no error. Its
presence is what turns on real mode in the interface. `postbuild` copies it into `dist/`.

`docs/prototype/newsroom-screen-test.html` is the entire interface: one file, all pixels
drawn procedurally in canvas, no framework, no build step. It runs as a demo in a plain
browser and as the real app when `window.lateEdition` exists. **Its path looks like
documentation and is not** — see [`releasing.md`](releasing.md) before packaging.

Inside it: a 470×180 canvas over a 1950px-wide world, eight desks at fixed positions, the Chief's
office on the back wall at 0.85 parallax. **Invariant: no desk may cover the office
frontage.** The floor advances on a fixed twelve-per-second clock, never per animation
frame — do that and the staff move at the display's refresh rate.

## Working on it

```bash
npm run check     # typecheck + lint + tests — run before every commit
npm run app       # build and launch
npm run cli -- --help
npm run dist:win  # a real installer
```

The interface file is not compiled or linted, so it has no type safety. Two things stand in
for that:

```bash
# Parse it, and catch debug scaffolding left behind. Part of `npm run check`.
node scripts/check-ui.mjs

# Drive the real renderer headlessly and assert on what it produced
LE_DEBUG=1 npm run electron                    # bridge, floor, camera, Setup panel
LE_DEBUG=1 LE_DEBUG_RUN=1 npm run electron     # + a full offline edition, end to end
LE_DEBUG=1 LE_DEBUG_SECONDS=16 npm run electron  # long enough to catch a quip
```

`LE_DEBUG_RUN` files into its own throwaway newsroom in the temp directory. It must never
write into, or bill against, the user's own — a diagnostic that spends someone's plan
allowance is a bug.

The interface exposes `window.__leFloor()` and `window.__leProbe` in app mode for exactly
this. They are read-only snapshots plus the two result handlers, and they exist so changes
can be proven without a person watching the window.

## The field desk

`watch/field.ts`. A finished story's source URLs become a **case** — a beat file written with
`research: 0` and a marker comment, so hand-written beats are never touched. Checking those
pages costs nothing (adapters, no model), so it runs on app launch and whatever changed lands
on that case's spike. Nothing runs until the user picks it off.

A follow-up seeds the draft from the spike via `RunOptions.watchBeat` and starts at ASSIGN.
It must not re-poll: the check consumes the adapters' seen-state, so a second fetch returns
nothing. It reports on the newest `MAX_PER_RUN` changes only, so a long-ignored case can't
become the most expensive run of the week.

## Gotchas that have already cost time

- **`npm run electron` does not rebuild.** The interface is read from source while the main
  process runs from `dist/`, so the two drift and every channel the old engine lacks throws
  "No handler registered". The interface asks `le:api` at boot and shows a banner when they
  disagree, but use `npm run app` after touching `src/`.

- **Global CSS collisions.** `.card { display: flex }` broke the start gate; scope new
  class names and check computed styles.
- **Most agent CLIs return one block when they finish**, not a token stream. The console
  fills in one go after each call rather than typing live. The engine side is ready for real
  streaming if a provider offers it.
- **A forced provider has to survive a resume.** It didn't, once, and a run asked for as a
  dry run quietly spent a real plan allowance the moment the user answered the Chief.
