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
  rough, to nail relationships and timing — not final art. Iterated as a live private Claude
  Artifact that David plays with; **republish to the same URL each pass** so his link stays
  valid: <https://claude.ai/code/artifact/3f3bab13-c6f1-49b8-b4c9-7da3d4d1f415> (owned by
  demo@lodid.co.uk; an earlier one lives on David's own login).

### 6.2 What the prototype currently shows
It has grown from a single-desk bust into a **whole newsroom floor**:
- A **zoomed-out, walkable, 4-layer parallax** newsroom (**470×180** logical, integer-scaled,
  `image-rendering: pixelated`): far city+moon (0.25) → back wall — windows, clock, big masthead,
  doors, the office window, background typers (**`BP` = 0.85, near-flat on purpose**) → desks +
  characters (1.0) → foreground bulbs + ticker (1.15).
- **A desk per staffer, personalised for the job:** Sam (reporter — typewriter + rotary phone),
  Dot (editor — paper spike + pencil cup), Gus (copy boy — big central paper stack + call bell),
  Mac (copy desk — galleys + loupe + glue pot), Iris (photo desk — plate camera + a hanging
  photo-line + a red safelight). Plus a few anonymous **background typers** for depth.
- **Camera follows whoever's cast** — click a staff card and it glides to their desk; **Free pan**
  deselects to look around. ← →/A-D walk the active character; **Space** to sit; scene buttons
  (Sit·smoke, Typing, Coffee, Phone, Stop the press) drive the active character; **See the Chief**
  / **Step out** walk them through a door.
- **Cast of 5**, palette-swapped **plus per-character accessories for personality**: Sam
  stubble + loose tie, Dot pencil-behind-the-ear, Gus bow tie + freckles, Mac green eyeshade +
  specs, Iris beret + long hair. Front idle/seated **and** a side-profile walk whose head carries
  the right hat + accessories (women keep a full head of hair; the mouth sits on the face front).
- **The Chief's office:** a **window in the back wall in its own no-desk strip** (door beside the
  window) so a foreground desk can never slide over it; a big centred **"THE DAILY BIT"** masthead
  above it. Chief silhouette (fedora) is dim until a reporter enters (See the Chief) or an ambient
  blip fires — then the **light snaps on and a visitor silhouette appears**, arms waving.
- **Ambient life fires on a timer:** the rotary phone rings (spinning dial, red light, buzz
  lines), a finished page **ejects from the active typewriter** and flutters off, **staff
  couriers — usually the Chief out of his own door — carry work between desks and drop it**, a
  copy-boy runner sprints the back row, the office light blips, and **smoking is an occasional
  idle beat** (strike a match → a slow lazy curl → done). Plus rain on the blinds, wire ticker,
  swaying bulbs, ceiling fans, wall clock, a cat on the filing cabinet.
- **Props:** rotary phone, a **solid animated typewriter** (platen, ribbon spools, striking
  typebars, paper feed + eject); **background typers are hands-free** (the machine animates).
- **Stop the press:** red overlay + banner + vignette.

### 6.3 Art-direction notes locked so far (from David)
- **Chunky/iconic proportions**, not lanky — big head, wide torso, stubby limbs, low pixel
  density. Locked into the art brief.
- **Comfortable zoom** (470 logical wide — see ~2 desks at once) and **snappy walking**; the room
  is fuller and spread out (nothing bunched around a door).
- **Camera follows the selected character; free-pan when none is selected.**
- **Every character gets a distinct desk kit + accessories** — it's a noir newsroom, they must
  read as individuals, not palette clones.
- **The Chief's office lives in the back wall in its own strip**, with the door beside the window
  and a big centred masthead; the back wall barely parallaxes so no desk covers the window.
- **Smoke** is an occasional idle beat (light up, slow curl), **never constant**.
- **Background typers have no visible hands** — the typewriter does the work.
- **Side-profile heads carry the character's hat + accessories**; women keep a full head of hair
  (down the back **and** framing the side — no mohawk/mullet), and the **mouth is on the front of
  the face**, not the centre of the head.
- **Coffee** is a cup held for a few sips — **no steam**.
- **Chief's office = a window** with **silhouettes** (not full-colour close-ups), Chief seated
  behind a desk, upper-body only, light-on-with-visitor.
- **Flat 2D desk**; **female characters must not read as bearded** (jaw-shadow band removed).
- Production characters are **autonomous** (event-log driven); the prototype's manual controls
  stand in for that.

### 6.4 Still open / next tweaks
- **Scene buttons are generic.** Firing "Typing" on the photo desk (Iris, no typewriter) looks
  odd — in the real build each character's actions should come from their **role/event-log**, not
  a shared button bar. Could gate the buttons per desk in the prototype too if David wants.
- **"Pose inspector"** mode (step frame-by-frame through a single animation) — floated, not built.
- Keep sanity-checking the **side-profile heads** and the **office framing** on David's screen;
  the preview pane in Claude Code often collapses, so verify at full size (a JS-drawn magnifier
  overlay is a handy trick for inspecting a tiny walking sprite).

### 6.5 How to continue the prototype (mechanics)
- Plain HTML+canvas, **no build step** — open the file, edit the `<script>`, reload. Then
  **republish to the same Artifact URL** (see §6.1) so David's link updates.
- Helpers: `R(x,y,w,h,color)` fills a rect; `P(x,y,color)` a pixel; `limb(x0,y0,x1,y1,w,color)` a
  thick connected line. Everything draws on a **470×180** logical canvas scaled up, smoothing off.
- **Layout constants:** `DESKX` (one desk-x per cast member, indices match `CAST`), `deskX(i)`,
  `AC()` (active character's desk centre), `BP` (back-wall parallax, 0.85), `OFFICE_XB`/
  `WINDOW_XB` (the office in its no-desk strip). Two desks sit left of the office, three to the
  right — that split + near-flat `BP` is *why* no desk slides over the window; keep it if you move
  things.
- Layers: `layerFar(0.25)/layerBack(BP)/layerMain(1)/layerFore(1.15)`, each
  `g.translate(-cam*factor)`. **Anything drawn inside a layer is world-space**; screen-space UI
  (speech bubbles) is drawn in `render()` after the layers using `AC()-cam`.
- **`drawNewsroom()`** loops every desk: draws the light pool, the occupant (active char =
  `drawSeated`/`drawRoamer` per `state.scene`; the rest = `drawIdleSitter`), then
  **`drawDeskProps(c,x,scene)`** which dresses the desk by `c.desk` (`reporter`/`editor`/
  `copyboy`/`copydesk`/`photo`), the desk front, and the nameplate.
- Character rig: `headFront`/`headSide` (+ `drawAcc` for accessories), `drawStand`/`drawWalk`,
  `drawSeated`/`drawSeatedHands`; `hatOn` handles fedora/cap/**beret**/none. Camera follows `AC()`
  when seated / `player.x` when roaming; `state.panMode` is free-pan.
- **When David delivers real Aseprite sheets**, M3 (PixiJS) consumes `sheets/*.png` + `*.json`
  atlases per the art brief's pipeline; the prototype's procedural drawing is throwaway reference.

### 6.6 Progress log (newest first)
Each line is one commit; see `git log` for the exact SHAs.
- **The product turn — brief-the-Chief, budgets, and the real-engine bridge** (`2590a7a`→`07b312e`):
  **the product's shape is now settled: a newsroom you brief like a publisher** — you tell the
  Chief a topic (a competitor, a rumour, "leaked GTA 6 build"), staff-with-personalities research
  it, banter, pass work, flag bad recon and re-verify, and hand you a clean front page; you mostly
  just approve the Chief's escalations. (Modelled on **Munder Difflin**, a local multi-agent harness
  where you brief one boss and agents work on their own budgets.) The prototype became a *live sim* you
  brief like a publisher — staff have **roles + per-agent token budgets**, work event-driven and
  concurrent (copy boy runs pages desk-to-desk, copy desk bounces thin recon back to verify, idle
  banter), and the Chief escalates only the few calls that need you (bump a budget / run page one).
  The **engine** grew the matching wiring (`591b572`): `run --brief "<topic>"` (synthetic story →
  ASSIGN→PRESS, no sources), `run --cap <tokens>` / `config edition.tokenCap` (holds reporters the
  budget can't afford → "held for the next edition"), and a `reel.json` per edition (timed log +
  per-role token ledger + headline). The prototype can **Load a real edition (reel.json)** and
  replay it with the true headline and real per-role spend. All `--provider fake`, `npm run check`
  green (47 tests).
- **Full newsroom + fixes** (`c13f840`, the pixel-art rework): per-character desks, camera
  follows the cast selection + Free-pan, Mac & Iris added with accessories; Chief's office moved
  into its own back-wall strip (near-flat parallax so no desk covers it), door beside window, big
  centred masthead; rotary phone, animated typewriter, staff couriers, smoking-as-idle-beat,
  hands-free background typers; side-profile heads fixed (full hair + mouth on the face), coffee
  steam removed, props spread out, comfortable zoom, snappier walking.
  *(This landed as one commit but was many play-test rounds with David: solid typewriter →
  rotary phone/couriers/light-up smoke → camera-follow + 5 desks → zoom + big work-objects →
  cards/spacing/no-bg-hands → office-in-back-wall-strip + hair → profile heads.)*
- **Keyboard-slab typewriter + Chief-in-office** (`283e319`)
- **Flat desk + office window silhouettes** (`9d4ae23`)
- **Slow smoke, wall-mounted doors, de-bearded women** (`4e9a25c`)
- **Stub arms, doors, first office cutaway** (`b7434b3`)
- **Chunky/zoomed-out proportions + side-walk** (`681a453`)
- **Art brief + walkable parallax newsroom** (`4e8cba9`)
- *(Earliest: single-desk bust demo.)*

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
