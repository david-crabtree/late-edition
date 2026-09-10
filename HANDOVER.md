# Handover — picking this up cold

Everything you need to continue this work with no prior context. Read this, then
[`docs/architecture.md`](docs/architecture.md), then the code. **Trust the code over both.**

> **Git is local only.** No remote is configured and nothing has been pushed. Do not add a
> remote or push unless David asks. See [`docs/releasing.md`](docs/releasing.md) for what has
> to happen before the first push — it is not optional and some of it is irreversible.

---

## 1. What this is

**Late Edition** — a free, MIT, local-first Electron + TypeScript desktop app. It wraps the
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

- `npm run check` is green: **107 tests**, typecheck and lint clean.
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
npm run check       # typecheck + biome + vitest — run before every commit
npm run app         # build and launch
npm run dist:win    # a real installer in release/
npm run cli -- --help
```

The interface is one big HTML file that is **not compiled or linted**, so it has no type
safety. Two things stand in for that, and you should use both:

```bash
# 1. Syntax-check the interface (it is a single inline <script>)
node scripts/check-ui.mjs

# 2. Drive the real renderer headlessly and assert on what it produced
LE_DEBUG=1 npm run electron                     # bridge, floor, camera, layout, Setup panel
LE_DEBUG=1 LE_DEBUG_RUN=1 npm run electron      # + a full OFFLINE edition, end to end
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
2. **Format changes the voice, never the facts.** Every format in `core/formats.ts` carries
   the citation rules and the no-invented-facts rule through unchanged.
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
- **Agent CLIs install as `.cmd` on Windows**, so `execFile('claude')` ENOENTs. The provider
  layer wraps `cmd.exe /c`.
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

- No landing page. David wants one with a donate / buy-me-a-coffee link and no other payment.
- Only the Claude provider has been driven end to end. The other five are written, detected,
  and labelled "untested here" in Setup. Each needs a real run to promote.
- The picture desk writes a brief; nothing consumes the image slot yet.
- macOS is unbuilt and unsigned by choice.

## 9. First fifteen minutes

```bash
git log --oneline -15          # the recent work, newest first
npm run check                  # confirm 107 green
LE_DEBUG=1 npm run electron    # confirm the app boots and the probe passes
npm run app                    # look at it
```

Then read [`docs/architecture.md`](docs/architecture.md) for how the pipeline fits together,
and `src/main/pipeline/run.ts` for the state machine.
