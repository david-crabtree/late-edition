# Handover — picking this up cold

Everything you need to continue this work with no prior context. Read this, then
[`docs/architecture.md`](docs/architecture.md), then the code. **Trust the code over both.**

> **Git is local only.** No remote is configured and nothing has been pushed. Do not add a
> remote or push unless David asks. See [`docs/releasing.md`](docs/releasing.md) for what has
> to happen before the first push — it is not optional and some of it is irreversible.

---

## 1. What this is

**Late Edition** — a free, source-available, local-first Electron + TypeScript desktop app.
Apache 2.0 with the Commons Clause. It wraps the
AI agent CLIs you already have installed (Claude Code, Codex, Gemini CLI, OpenCode, Ollama,
or a direct API key) and casts them as the staff of a 1940s noir newspaper. You brief the
Chief with a topic; researchers, reporters, copywriters, an editor and a copy desk work it
and file a real edition to disk. You watch it happen on an animated pixel-art newsroom floor.

The multi-agent orchestration is the product. The newsroom is the hook. Users bring their own
agent subscriptions, so it costs nothing to run and there is no service behind it.

**David** owns this. He is a pixel artist, this is his first proper public release, and he is
proud of it. He gives notes as numbered lists, often with screenshots. Take them literally,
work through all of them, and tell him plainly when one of his premises is wrong.

## 2. Where it stands

- `npm run check` is green: **120 tests**, typecheck and lint clean.
- `npm run dist:win` produces a **working installer and portable .exe**. The packaged app has
  been booted and confirmed to load, detect the real Claude CLI and run.
- The app has filed **real editions** on David's Claude plan. It works end to end.
- Not yet done: no remote, no release, no icon of his own, no landing page.

## 3. Two hard release conditions

David set these and they are not negotiable.

1. **The repo must not name the third-party project this was modelled on.** Done — the
   working tree is clean. Check with a case-insensitive grep before any release.
2. **It must not read as AI-written.** No attribution trailers, no notes addressed to a
   coding session. 61 of 69 commit messages carried a trailer; all were rewritten with
   `filter-branch` on 2026-09-10. **File contents were untouched — only messages changed.**
   The genuine pre-rewrite history is on the local branch `backup/pre-attribution-scrub`.

   **If you make commits here, do not add attribution trailers**, and re-check before the
   first push:

   ```bash
   git log --all --format='%H %B' | grep -iE 'co-authored-by|generated with' | head
   ```

## 4. How to run and verify

```bash
npm run check       # typecheck + biome + check:ui + vitest — run before every commit
npm run app         # build and launch  ← use this, not `npm run electron`, after any src/ change
npm run dist:win    # a real installer in release/
npm run cli -- --help
```

The interface is one big HTML file that is **not compiled or linted**, so it has no type
safety. Two things stand in for that, and you should use both:

```bash
# 1. Parse it, and catch debug scaffolding left behind. Part of `npm run check`.
node scripts/check-ui.mjs

# 2. Drive the real renderer headlessly and assert on what it produced
LE_DEBUG=1 npm run electron                     # bridge, floor, camera, layout, Setup, handshake
LE_DEBUG=1 LE_DEBUG_RUN=1 npm run electron      # + full OFFLINE edition, clarification, the
                                                #   empty-desk path, halt recovery, back issues,
                                                #   rewrite, the field desk and Ida's offer
LE_DEBUG=1 LE_DEBUG_SECONDS=16 npm run electron # long enough to catch a quip
```

`LE_DEBUG_RUN=1` files into a throwaway newsroom in the temp directory and forces the offline
stand-in. **It must stay that way.** `LE_DEBUG_RUN=real` is the deliberate opt-out that uses
the real staff and the user's own newsroom — only run it when David has said to, and tell him
what it cost.

The probe is the main tool here. It reports tick rate, staff pace, camera position, who spoke,
the Setup panel's state, layout geometry, a whole offline edition, the mid-run decision, the
rewrite path and the back-issues drawer. Extend it rather than eyeballing screenshots.

## 5. The contracts worth protecting

Break any of these and the output stops being worth anything. All three have tests.

1. **Citations resolve or they die.** An agent cites by writing a source's literal signal id.
   Only real ids become footnotes; invented markers like `[#1]` are scrubbed. This is why a
   story cannot cite a source the researcher never found.
2. **The masthead changes the judgement and the voice, never the facts.** Every outlet in
   `core/formats.ts` carries the citation rules and the no-invented-facts rule through
   unchanged, and says so in its own directive. The outlet reaches the reporter, the editor
   and the writer — but never the researcher, because the reporting is the same reporting
   whichever paper runs it.
3. **A desk with no agent stops the run.** Desks scaffold `unset`. An empty one throws
   `StaffNotConfiguredError` naming the desk, rather than silently falling back to the
   offline stand-in and filling the paper with invented copy.

## 6. Things already learned the hard way

- **The floor steps on a fixed 12/sec clock, never per animation frame.** It was called from
  `render()` once, which made the staff move at the display's refresh rate — 5x too fast at
  60Hz. If they look wrong, check which loop is stepping them.
- **`preload.cjs` is CommonJS on purpose.** ESM preloads don't load reliably in Electron, and
  a missing preload silently drops the app into demo mode with no error.
- **`docs/prototype/newsroom-screen-test.html` is the app, not documentation.** It must be in
  the builder's `files` list or the packaged app opens an empty window.
- **A forced provider must survive a resume.** It didn't once, and a run asked for as a dry
  run quietly spent a real plan allowance the moment the user answered the Chief.
- **The stop switch is a file, so it outlives the window.** The app tracked it per-session
  once, which meant a halt set before a restart left both buttons hidden and no way out.
  Anything that persists on disk has to be read back at launch, not remembered.
- **`runStreaming` in `agents.ts` is a near-copy of `runToText` in `providers/types.ts`.**
  Fields added to one silently vanish in the other — the cache split did exactly that. If
  you touch `AgentUsage`, touch both.
- **Destructive actions go to the recycle bin, never `rm -rf`.** Deleting an edition uses
  `shell.trashItem`. It's the user's own writing and their own token spend.
- **Agent CLIs install as `.cmd` on Windows**, so `execFile('claude')` ENOENTs. The provider
  layer wraps `cmd.exe /c`.
- **The interface loads from source, the engine from `dist/`.** `npm run electron` skips the
  build, so a new interface can pair with an old engine and every new channel throws "No
  handler registered". The interface now asks `le:api` what the engine has and shows a red
  banner rather than failing silently — but **use `npm run app` after changing `src/`.**
- **Global CSS collisions.** `.card { display: flex }` broke the start gate once. Scope new
  class names.
- **Most agent CLIs return one block when they finish**, not a token stream, so a desk's
  console fills in one go after its call rather than typing live.

## 7. Where the tokens go

Measured across three of David's real editions. This is the shape every time:

| | Share |
| --- | --- |
| Prompt-side (context sent, much of it cached) | 96–98% |
| Text actually written | 2–4% |
| **The researcher desk alone** | **56–60%** |

The researcher makes one call, writes ~6k of findings, and costs more than the rest of the
paper combined, because web search pulls whole pages into context. The levers, in order of
effect: put the researcher on the cheap model (Setup has a **Use suggested models** button
for exactly this), then Light research depth, then `maxFindings`.

Cache reads are counted in the headline total because providers count them, but they are the
cheap part. The readout splits written / read / cached so the number is readable.

## 8. What's left

**Before the first public release** — see [`docs/releasing.md`](docs/releasing.md) for the
full checklist and the commands:

- Drop `backup/pre-attribution-scrub` and the `refs/original` refs, then push **only** `main`.
- Set `build.appId` — it is a placeholder.
- Replace `build/icon.png` — it is generated by `scripts/make-icon.mjs` so a release never
  ships the Electron logo, but it is a placeholder, not David's art.
- Bump the version. It is still `0.0.1`.
- Apply to **SignPath Foundation** for free open-source code signing. It is the route
  Microsoft's own docs point at, and the review is the long pole. Check the contributor
  multi-factor condition first. Azure Artifact Signing is **not** open to David — individuals
  are limited to the USA and Canada.

**Product, not yet done:**

- The app only files editions from a typed brief or a watched beat. Standing assignments on
  a cadence, tripwires and Late Extras, distribution to Slack or a webhook, and searching the
  morgue all exist and are tested — but only in the CLI. Either surface them or keep the
  README honest about it.

- No landing page. David wants one with a donate / buy-me-a-coffee link and no other payment.
- Only the Claude provider has been driven end to end. The other five are written, detected,
  and labelled "untested here" in Setup. Each needs a real run to promote.
- The picture desk writes a brief and now has its own agent slot (`photo_desk`, haiku
  suggested). Nothing consumes the image slot yet — there is no way to attach a picture.
- macOS is unbuilt and unsigned by choice.

## 9. The field desk

Ida Stringer watches the pages a filed story came from. Each story she follows is a **case**.
The design turns on two measured facts:

- **Polling is free.** No source adapter touches a model, so checking every watched page
  costs nothing. `checkWatched()` returns `tokens: 0` and a test asserts it.
- **A follow-up skips the two most expensive desks.** Measured on a real offline run:

  | | Desks billed |
  | --- | --- |
  | First edition | copydesk, editor, reporter, researcher, triage, writer |
  | Follow-up | copydesk, editor, reporter, writer |

  Cases are written with `research: 0`, and `runWatch` passes `clarify: false`, so the
  researcher and triage never run. Three tests pin this, including that a follow-up costs
  less than the edition it follows.

**There is no field-desk model.** Ida is the byline; a follow-up runs on the ordinary
reporter, writer, editor and copy desks. Setup says so in a tooltip, because "where's her
desk?" is the obvious question.

**The flow.** A paper lands → Ida asks, in the panel under the app bar, whether to stay on
it → yes writes a beat from the story's source URLs → on every app launch she polls them
(free) and anything that changed lands on that case's **spike** → the strip under the app
bar tells you, and the **Case file** drawer shows every case with its sources.

You can run a case, spike its changes, pull one source off it, or drop the case. Removing
the last source drops the case. There is a master switch in the case file; off means no
polling at all, not a hidden panel.

**Cost guards.** Nothing ever runs by itself. A follow-up reports on the `MAX_PER_RUN`
newest changes only (12) — a case ignored for a month would otherwise hand dozens of diffs
to the reporter and become the week's most expensive run.

There is deliberately **no background daemon**. The CLI covers anyone who wants a real
schedule, and a desktop app that runs a service is a support burden.

`watchBeat` in `RunOptions` seeds a draft from the spike and starts at ASSIGN. It must not
re-poll: the adapters' seen-state is consumed by the check, so a second fetch returns nothing.

## 10. First fifteen minutes

```bash
git log --oneline -15          # the recent work, newest first
npm run check                  # confirm 120 green
LE_DEBUG=1 npm run electron    # confirm the app boots and the probe passes
npm run app                    # look at it
```

Then read [`docs/architecture.md`](docs/architecture.md) for how the pipeline fits together,
and `src/main/pipeline/run.ts` for the state machine.
