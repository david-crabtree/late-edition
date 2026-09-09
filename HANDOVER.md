# Late Edition — Handover

**Read this first.** It's written for a fresh Claude/session with **no prior context**, and for
David (the human) continuing on another machine/login. It explains what the project is, what's
built, how to run it, how the code is organised, and exactly where the pixel-art prototype left
off. Everything here is backed by files in this repo — trust the repo over this doc where they
disagree, and skim [`docs/decisions.md`](docs/decisions.md) for the "why" behind choices.

---

## 0. TL;DR for the next session

- **Late Edition** is a free, local-first, MIT desktop app that wraps AI-agent CLIs (Claude
  Code, Codex, Gemini, Ollama, …) as the staff of a **1940s noir newspaper** that reports on the
  user's own sources (git repos, RSS, inboxes, folders, calendars, web-diffs). The multi-agent
  orchestration is the product; the newsroom fiction is the hook.
- **The headless engine is essentially built and tested** (milestones M0, M1, M2, M4-headless,
  M5, plus the morgue + an ics adapter). ~47 Vitest tests pass; `npm run check` (typecheck +
  lint + test) and `npm run build` are green.
- **The UI is NOT built.** Milestone 3 (the Electron + PixiJS pixel-art newsroom) and M6 (real
  art, packaging) are deferred. We have instead produced: a complete **art brief**
  ([`docs/art-brief.md`](docs/art-brief.md)) and a **playable, code-drawn prototype** of the
  newsroom ([`docs/prototype/newsroom-screen-test.html`](docs/prototype/newsroom-screen-test.html)).
- **David is a pixel artist** and will draw the real assets. Recent work has been iterating the
  prototype as a *moving reference*, taking his art-direction notes. See §6 for exactly where
  that stands and what's still being tuned.

To orient in the code, read in this order: this file → `docs/build-plan.md` (the original
vision) → `docs/decisions.md` (what was actually decided) → `src/main/pipeline/run.ts` (the
heart) → `docs/art-brief.md` (for the art side).

---

## 1. What the app does

An **edition** is one newspaper. It's produced by an explicit, resumable pipeline; every stage
writes plain files so a crashed run resumes and everything is greppable:

```
WIRE → ASSIGN → REPORT → ANGLES → CALL → WRITE → CHECK → PROOF → PRESS → DONE
```

- **WIRE** — source adapters (pure fetch/diff, no LLM) emit `Signal`s.
- **ASSIGN** — one provisional story per beat that has new signals; resolve which provider runs
  each role.
- **REPORT** — one *or more* reporters investigate each story and file JSON reports (facts tied
  to signal ids, a proposed angle, confidence, urgency).
- **ANGLES** — collect the independent angle memos; detect disagreement.
- **CALL** — the managing editor sets headline/standfirst/placement; genuine disagreement runs
  as **Competing Takes** (never silently merged).
- **WRITE** — the rewrite desk turns reports + chosen angle into finished copy.
- **CHECK** — the copy desk verifies every `[signalId]` cited in the copy resolves to a real
  signal (deterministic check ∪ an LLM check); unsupported → **Corrections**. Also links related
  past coverage from the morgue, and applies **stop-the-press** (urgent + corroborated → page
  one).
- **PROOF** — headless auto-approve (the app's Editor's Office replaces this later).
- **PRESS** — assemble the `Edition`, render `edition.md` + a self-contained noir `edition.html`.

**Non-negotiables** (from the build plan §2, honoured throughout): local-first (no server we
operate), bring-your-own-agent (we don't store the user's provider creds when a CLI owns auth),
every artefact a plain file, provider-neutral, no paid deps, MIT.

---

## 2. Current status — what's done

| Milestone | Tag | State |
|---|---|---|
| M0 Skeleton | `m0-skeleton` | ✅ TS/ESM, Biome, Vitest, GitHub Actions CI, the **fake provider** |
| M1 Headless paper | `m1-headless-paper` | ✅ full WIRE→PRESS from CLI → `edition.md`/`.html` |
| M2 Angles & the call | `m2-angles` | ✅ multiple reporters, provider mixing, Competing Takes, copy-desk citation checks |
| M5 Distribution | `m5-distribution` | ✅ Slack / Teams / webhook / RSS-out channels (opt-in, `--dry-run`) |
| M4 Stop the press (headless) | `m4-stop-the-press` | ✅ urgency→page-one + tripwire **Late Extras** (`watch`) |
| Morgue + ics | `morgue-and-ics` | ✅ archive `search` + related-coverage links; 6th adapter (ics) |

**Adapters (6):** `rss`, `git_local`, `github`, `web_diff`, `folder`, `ics`. **Providers (7):**
`claude`, `codex`, `gemini`, `opencode`, `ollama`, `directapi`, `fake`. **Distribution channels
(4):** `slack`, `teams`, `webhook`, `rss`.

**Verification reality check:** none of the real agent CLIs are installed on the dev machine, so
the live provider path is written against verified docs (`docs/providers-research.md`) but has
only been exercised end-to-end via the deterministic **fake** provider. First real task when a
provider is available: run a genuine edition and confirm the live path.

---

## 3. How to run it

Requires **Node 20+**. From the repo root (`D:\Late-Edition` on the dev machine):

```bash
npm install
npm run check          # typecheck + lint + test  (must stay green)
npm run build          # compile to dist/
```

Use the CLI in dev with `npm run cli -- <command>` (or `node dist/cli/index.js <command>` after
build). Everything works **offline** with `--provider fake`:

```bash
npm run cli -- init ./nr                                  # scaffold a newsroom
npm run cli -- run --newsroom ./nr --provider fake        # produce an edition
npm run cli -- run --newsroom ./nr --provider fake --distribute --dry-run
npm run cli -- watch --once --newsroom ./nr --provider fake   # tripwire → Late Extra
npm run cli -- search "security" --newsroom ./nr          # the morgue
npm run cli -- detect                                     # which providers are installed
```

Output lands in `./nr/editions/<date>-NNN/` (`edition.json`, `edition.md`, `edition.html`,
`pipeline.json`, `log.jsonl`, and per-story files under `stories/`).

**To wire a real provider:** edit `./nr/newsroom/staff.yaml` (e.g. `managing_editor: { provider:
claude }`), run `npm run cli -- detect` to confirm it's ready, then `run` without `--provider`.

---

## 4. Repo map

```
src/
  cli/index.ts              CLI entry (init/run/detect/distribute/watch/search)
  main/
    core/                   Signal + Edition domain types & hashing
    config/                 newsroom YAML/MD loader + scaffold (init)
    adapters/               6 source adapters + registry + runner (types.ts is the contract)
    providers/              7 agent providers + registry + detection (types.ts is the contract)
    pipeline/               the state machine: run.ts, stages.ts, agents.ts, prompts.ts,
                            contracts.ts (JSON shapes), draft.ts, json.ts, context.ts
    paper/render.ts         Edition → Markdown + self-contained noir HTML (pure functions)
    store/                  paths, file IO, adapter state, wire, edition-store, log, morgue
    distribute/             channels/{slack,teams,webhook,rss} + registry + run
    watch/                  tripwire.ts + run.ts (Late Extras)
docs/
  build-plan.md             the original full vision (the brief we're building to)
  decisions.md              running log of decisions + trade-offs (READ THIS)
  providers.md              verified CLI invocation matrix
  providers-research.md     detailed, cited CLI research
  art-brief.md              FULL pixel-art production spec (every sprite/frame/room)
  adding-a-source-adapter.md, adding-a-provider.md   contributor how-tos
  prototype/newsroom-screen-test.html   the playable art prototype (see §6)
HANDOVER.md                 this file
```

**Extending is one file each** (by design): a new source adapter = implement `SourceAdapter`
(`src/main/adapters/types.ts`) + register in `adapters/index.ts`; a new provider = implement
`AgentProvider` (`src/main/providers/types.ts`) + register in `providers/registry.ts`; a new
distribution channel = implement `Channel` + register in `distribute/registry.ts`. See the
how-to docs.

---

## 5. Conventions & gotchas

- **Lint/format:** Biome. `npm run lint:fix` before committing. It reformats aggressively
  (collapses lines, reorders imports) — expect it to touch files you edit.
- **ESM + `.js` import specifiers** even for `.ts` files (NodeNext). Keep the `.js` extension in
  imports.
- **Providers return the model's *text*;** the pipeline owns JSON parsing (`pipeline/json.ts`
  strips fences, brace-matches, retries once). Don't parse JSON inside a provider.
- **Never invent CLI flags** — verify against the tool; detection degrades gracefully.
- **Windows dev-machine specifics:**
  - The `folder`/`ics` adapters need **real Windows paths** (`C:/Users/...`), not git-bash
    `/c/...` paths.
  - `npm install` prints "install scripts not covered by allowScripts" — that's fine; the
    native Biome/esbuild binaries still install via optionalDependencies.
  - git needed `git config --global --add safe.directory D:/Late-Edition` once.
- **Commits:** small, per-milestone tags. Co-author trailer used on commits:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **The 5 `npm audit` findings are dev-toolchain only** (vitest/vite/esbuild) — 0 in shipped
  deps. Don't force the breaking `vitest@5` bump.

---

## 6. The pixel-art side (where the visual work stands)

This is the active thread. **David is the artist** and will draw the final sprites; Claude's job
here is (a) the **art brief** (the spec to draw to) and (b) a **code-drawn prototype** that moves,
so the artist has a living reference for timing, layout, and the specific actions.

### 6.1 The two deliverables
- **[`docs/art-brief.md`](docs/art-brief.md)** — the full production spec: the 32-colour noir
  palette + 11-slot per-character **swap ramp** (a new hire = a palette, not a redraw); the
  chunky/iconic rig proportions; **every animation** with cell size, frame count, fps and a
  per-frame description (idle+smoke, talk, type, coffee, phone, thinking, red-pencil,
  stop-the-press shock, walk 8-frame, run-with-paper); every prop & effect; **per-room BG/FG
  layer stacks** (Newsroom, Editor's Office, Press Room, Street, Morgue); UI assets; and the
  **Aseprite export pipeline** (layer names, animation tags, `.gpl` palettes, export command).
- **[`docs/prototype/newsroom-screen-test.html`](docs/prototype/newsroom-screen-test.html)** —
  a single self-contained HTML file. **Every pixel is drawn procedurally in `<canvas>` — no
  image assets.** Open it in a browser. It's a *representation of the actions*, deliberately
  rough, to nail relationships and timing — not final art. Also published as a private Claude
  Artifact (David has the link).

### 6.2 What the prototype currently shows
- A **walkable, 4-layer parallax** newsroom (320×180 logical, integer-scaled, `image-rendering:
  pixelated`): far city+moon (0.25) → back wall w/ windows, clock, sign, doors, office window,
  a colleague typing (0.55) → floor + hero desk + player (1.0) → foreground bulbs + ticker
  (1.15).
- **Controls:** ← →/A-D walk; **Space** to sit at the desk; on-screen scene buttons (Idle·smoke,
  Typing, Coffee, Phone, Stop the press) seat & perform; **See the Chief** / **Step out** walk
  the character through a **back-wall door** (camera freezes so they line up, then they fade
  through).
- **Cast:** 3 palette-swapped characters (Sam/Dot/Gus), **click to cast**, **rename the byline**
  (updates the desk nameplate live). Front-view idle/seated, **side-profile walk**.
- **Ambient life:** the colleague typing, rain on the blinds, wire ticker, swaying bulbs,
  ceiling fan, wall clock, a cat that flicks its tail.
- **The Chief's office:** an interior **window in the back wall** where the Chief sits behind his
  desk (upper body only — a sill hides the rest), **dim while he's alone; the light snaps on and
  a visitor silhouette appears, arms waving, when a reporter walks through his door**.
- **Stop the press:** red overlay + banner + vignette.

### 6.3 Art-direction notes locked so far (from David)
- **Chunky/iconic proportions**, not lanky — big head, wide torso, stubby limbs, low pixel
  density. Locked into the art brief.
- **Zoomed out** for a sense of space; **fuller** rooms.
- **Side-profile walk** (not the front sprite sliding); walk speed felt good after tuning.
- **Seated arms are short stubs**, not long shoulder→hand limbs; desk props are **centred** in
  front of the sitter so hands land on them.
- **Smoke** must be a slow lazy curl, not a fast exhaust.
- **Doors on the back wall** (flush, not floating); water cooler kept off the doors.
- **Chief's office = a window** with **silhouettes** (not full-colour close-up characters), Chief
  seated behind a desk, upper-body only, light turns on with a visitor when a reporter enters.
- **Flat 2D desk** (no drawers/faux-depth).
- **Female characters must not read as bearded** — the jaw-shadow band was removed; hatless
  characters get longer side hair.
- Production characters are **autonomous** (event-log driven); the prototype's manual controls
  stand in for that.

### 6.4 Still open / next tweaks on the prototype (David's running list)
These are the items last raised — verify against the live prototype and keep iterating:
1. **Typing hands vs. typewriter** — this has been the stubbornest note. Latest fix (v7) moves
   the typewriter **body up/back** and makes the **keyboard a separate front slab**, with the
   fingertips a couple of px **below** the body so they can't overlap it. If it *still* reads as
   "hands through the typewriter," the reliable fallback is to **hide the hands entirely behind
   the machine** and sell typing via the machine (key pop + carriage nudge + paper wiggle) plus a
   body bob — do that rather than nudging pixels again.
2. **Chief's office** — was too cramped; door & window now spaced and the window enlarged with
   the Chief seated + light-on-on-entry. Confirm it reads and isn't behind the hero desk.
3. Possible polish David floated: angrier office silhouettes (slam/thrown paper/third figure); a
   "pose inspector" mode to step frame-by-frame through a single animation.

### 6.5 How to continue the prototype (mechanics)
- It's plain HTML+canvas, no build step — open the file, edit the `<script>`, reload.
- Helpers: `R(x,y,w,h,color)` fills a rect; `P(x,y,color)` a pixel; `limb(x0,y0,x1,y1,w,color)` a
  thick connected line (used for connected arms/legs). Everything draws on a 320×180 logical
  canvas scaled up with smoothing off.
- Layers are drawn in `layerFar/layerBack/layerMain/layerFore`, each `g.translate(-cam*factor)`.
  **Anything drawn inside a layer is in world space** — the speech bubble bug was from drawing
  it inside a translated layer, so screen-space UI (bubbles) is drawn in `render()` after the
  layers using `DC - cam`.
- Character rig: `headFront` / `headSide`, `drawStand` / `drawWalk` (profile), `drawSeated` +
  `drawSeatedHands`. Palette swap is per-character `pal` objects; `hatOn` handles fedora/cap/none.
- **When David delivers real Aseprite sheets**, the plan is to switch the app's renderer (M3,
  PixiJS) to consume `sheets/*.png` + `*.json` atlases per the art brief's pipeline section; the
  prototype's procedural drawing is throwaway reference, not shipping code.

### 6.6 Iteration history (so a fresh session has the arc)
The prototype went through several passes, each addressing David's notes: (1) single-desk bust
demo → (2) walkable parallax room → (3) chunky/zoomed-out proportions + side-walk → (4) stub
arms + doors + first office cutaway → (5) slow smoke + wall-mounted doors + de-bearded women →
(6) flat desk + office **window** with silhouettes → (7, current) keyboard-slab typewriter +
**Chief-seated-in-office, light-on-with-visitor**. Git log messages ("docs: prototype pass — …")
capture each.

---

## 7. What's NOT done (roadmap)

- **M3 — the app UI** (Electron + PixiJS): the Newsroom, Editor's Office, Press Room rooms; the
  proof-reader with red-pencil verbs (Spike/Move/Dig/Note/Approve); talk-to-a-reporter; beats &
  staff config UI; the interactive **stop-the-press interrupt card** (run it / fold it / not
  news); animation driven by `log.jsonl`. The core is deliberately UI-ready (framework-agnostic
  `src/main/**`, an event log to animate off, a pure paper renderer to share).
- **M6 — release polish:** real art drop-in, Street & Morgue rooms, a "just the paper" mode,
  onboarding wizard, packaging for mac/Windows/Linux.
- **`imap` adapter** (the last v1 source) — needs a real IMAP dependency + a live server to
  verify; `folder` covers a support-export inbox meanwhile.
- **Validate the live provider path** against a real installed CLI (see §2).
- **SQLite morgue** — currently a dependency-free file scan; a `better-sqlite3` index can back it
  later without changing the interface if scan cost matters.

---

## 8. Working agreements observed here

- Keep `npm run check` green; commit small with milestone tags.
- Prefer the fake provider for tests (no tokens); spend real tokens only to validate the live
  path when asked.
- Record notable decisions (including dead ends) in `docs/decisions.md`.
- Dogfood: a scaffolded newsroom points a `git_local` beat at this repo, so the paper can report
  on its own construction.

*Good luck — the engine is solid and well-tested; the fun that's left is giving the newsroom its
face.*
