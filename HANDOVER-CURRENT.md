# Late Edition — Current Handover (2026-09-10)

> **Read this first.** It's the up-to-date state for continuing the work on another machine/login
> with no prior context. The older [`HANDOVER.md`](HANDOVER.md) has deep milestone history but is
> stale (it predates the app being wired to the real engine). Trust the repo over any doc.
>
> **Hard rule: git is LOCAL ONLY. Never add a remote, never push.**

---

## 1. What this is (30 seconds)

**Late Edition** — a free/MIT, local-first **Electron + TypeScript** desktop app that wraps
AI-agent CLIs (Claude Code, etc.) as the staff of a **1940s noir newspaper**. You "brief the Chief"
a topic; a multi-agent pipeline (researchers → reporters → copywriters → editors) researches your
own sources and files a real newspaper edition. Users bring their **own subscriptions** (Claude,
ChatGPT, Grok) and pick which model runs each role. The multi-agent orchestration is the product;
the newsroom fiction (a live pixel-art floor you watch) is the hook. Modelled on "Munder Difflin"
but must not be a clone.

**Cost framing (important):** agents run on the user's **plan/subscription usage**, not metered
API spend. The UI must reassure plan users their usage isn't a real-money charge, and put a heavy
warning only on genuine API billing. Detection sets `billing = subscription | api | free | unknown`.

## 2. Status right now

- **Headless engine: built + tested.** `npm run check` (typecheck + lint + test) is green — **71
  Vitest tests pass**. `npm run build` is green.
- **Electron app: wired to the real engine and working.** David has filed genuine real editions
  (e.g. a UK vaping-duty / Hayati story). Boots cleanly; real mode confirmed.
- **This session was all UX/product polish on the app + two engine tweaks.** See §3.

## 3. What changed this session (newest first, with commit hashes)

All on `main`, all local commits:

- `280e81f` **Adjustable research depth + length scales with substance.** Research-depth control
  (Light/Standard/Deep) on the budget card → passes `{research, maxFindings}` through `le:run` and
  `le:answerClarification`. Writer prompt now takes the story's `sourceCount` and writes fuller
  (4–6 paras) when well-sourced, short when thin, no padding (was a flat "2–4 paragraphs").
- `4fc707d` **In-app front page shows the WHOLE story**, not just headline+standfirst. Byline, full
  body with `[n]` footnote citations, numbered Sources, "Also inside" other headlines, "Open the
  full paper ↗". (Root cause of David's "small output": the app was dropping the article the engine
  actually wrote.)
- `efccf3d` **"LATE EDITION" masthead** in app mode; **bottom breathing room** (body is `display:flex`
  row → don't stretch `.wrap`, use `align-items:flex-start` so its padding shows); **brief box ~5
  lines** tall by default.
- `ccb3823` **Look-around controls**: on-screen ◀ ▶ pan arrows (hold to pan) + **⦿ Auto-focus / ○
  Free look** toggle (the auto-focus override). Arrows drop auto-focus; each run re-arms it.
- `ac4acb7` **Start-gate layout fix** (its `.card` collided with the global `.card{display:flex}` →
  renamed `.gatecard`) + **killed character keyboard controls in app mode** (arrows only pan now;
  A/D/Space inert).
- `b230527` **"Chief is waiting" stage banner** during a clarification + brief-section spacing.
- `27fad94` **Agents walk to the Chief on real queries.** `clarify:true` in the app; vague brief →
  Chief asks (banner + questions in log + "Answer the Chief" box) → answer resumes the paused
  edition. Mid-run decisions: `reporter/capped` (budget) and `editor/call`+`competingTakes` (page
  one) events send that agent walking to the office. (Both events already existed — no engine change.)
- `1c8f064` Real cigarette during the smoke beat (was smoke with no cig) + coffee cup held by a
  raised arm (was floating) + visit-the-Chief idle beat + tidier chrome (removed "GTA 6" demo chip).
- `50488ee` First-run **start gate** (resume / start new newsroom); Setup hidden on launch, behind
  ⚙ Settings.
- `8d4caf0` **The alive floor**: `people` layer — staff wander, smoke/coffee, sit, walk the page
  over as in-person handoffs; you sit at your desk only while working (except the Chief).

## 4. How to run / build / test

```bash
npm run app          # build + launch Electron (dist/electron/main.js)
npm run electron     # launch without rebuild
LE_DEBUG=1 npm run electron   # headless: checks the preload bridge + one real IPC round-trip, then quits
npm run check        # typecheck + biome lint + vitest (71 tests) — run before every commit
npm run build        # tsc + postbuild (copies preload.cjs to dist)
npm run cli -- --help         # the same engine as a CLI (tsx src/cli/index.ts)
```

- **Biome** for lint/format. Some autofixes are "unsafe": `npx @biomejs/biome check --write --unsafe ./src`.
- The prototype HTML is **not** compiled/linted (it's a static file); verify it in the browser.

## 5. Architecture map (key files)

### Engine (`src/main/`)
- `pipeline/run.ts` — `runEdition(opts)`: the state machine WIRE → ASSIGN → TRIAGE → RESEARCH →
  REPORT → ANGLES → CALL → WRITE → CHECK → PROOF → PRESS → DONE. `RunOptions` includes `brief`,
  `research`, `maxFindings`, `clarify`, `clarificationAnswer`, `resumeId`, `assignmentId`,
  `priorContext`, `onEvent`.
- `pipeline/stages.ts` — each stage. Research findings become citable **Signals**; copy desk
  verifies citations. `stageWrite` passes `sourceCount` to the writer. `stageCall` emits
  `editor/call` with `competingTakes`; `stageReport` emits `reporter/capped` on the token cap.
- `pipeline/prompts.ts` — built-in prompt DEFAULTS (triage/researcher/reporter/editor/writer/
  copydesk/frontpage). A newsroom can override via `newsroom/prompts/<name>.md`.
- `pipeline/clarify.ts` — `ClarificationNeededError(editionId, questions)`; thrown by TRIAGE when a
  brief is too vague. Resume with `resumeId` + `clarificationAnswer`.
- `paper/render.ts` — `renderHtml` / `renderMarkdown`: the full newspaper. Citation tokens
  `[research:hash]` → numbered footnotes; `STRAY_CITE` scrubber kills `[#3]`/`[ref]` junk.
- `core/edition.ts` — `Edition` / `Story` types (headline, standfirst, **body**, byline, sources,
  competingTakes, morgue, reports…).
- `providers/` — `claude.ts` (parseUsage, `WebSearch`/`WebFetch` tools for researcher, `claude auth
  status` for billing), `cli.ts` (**win32 needs cmd.exe /c** wrapper — npm installs `claude.cmd`,
  bare `execFile('claude')` ENOENTs), `registry.ts` (`detectAll`), `fake.ts` (offline dry-run).
- `store/halt.ts` — kill switch via a HALT sentinel file (`setHalt`/`clearHalt`/`isHalted`,
  `PipelineHaltError`). `store/log.ts` — `EditionLog(file, onEvent?)`; `onEvent` streams every
  pipeline event live to the UI. `store/assignments.ts` — standing assignments + cadence.

### Electron (`src/electron/`)
- `main.ts` — ESM main. IPC handlers: `le:detect`, `le:staff`, `le:setStaff`, `le:getRoot`,
  `le:pickRoot`, `le:run`, `le:answerClarification`, `le:halt`/`le:resume`/`le:isHalted`,
  `le:openPaper`, `le:editionHtml`. Newsroom folder persisted in `le-config.json` under
  `app.getPath('userData')`. `summarizeUsage()` → `{total, byRole, billing, costUsd}`. `LE_DEBUG`
  diagnostic in `did-finish-load`.
- `preload.cjs` — **CommonJS** (critical: **ESM preloads don't load reliably in Electron**).
  `contextBridge` exposes `window.lateEdition` = {detect, staff, setStaff, getRoot, pickRoot, run,
  answerClarification, halt, resume, isHalted, openPaper, editionHtml, onEvent}. **Its presence is
  what turns on "real mode" in the UI.** `postbuild` copies it to `dist/electron/`.

### The app UI = the prototype
- `docs/prototype/newsroom-screen-test.html` — a single self-contained HTML file (Artifact-format
  fragment: no `<head>`/`<body>`, one big IIFE `<script>`). The Electron window loads THIS file
  (`main.ts` RENDERER path). It runs as a **sim** in a browser and as the **real app** when
  `window.lateEdition` exists. Canvas 470×180, integer-scaled. `DESKX=[110,300,800,1010,1220,1430,
  1640]`, `WORLD=1760`, `FLOOR=150`, office frontage in the clear middle (`OFFICE_XB=454`,
  `WINDOW_XB=480`). **Invariant: desks must never cover the area in front of the Chief's office.**

## 6. Prototype internals (most recent work lives here)

- **Real-mode boot** (~end of the IIFE): `if(window.lateEdition){ document.body.classList.add('real');
  buildAppChrome(); buildSetup(); buildStartupModal(); }`.
- **`buildAppChrome()`** — hides the sim masthead→sets "LATE EDITION" masthead, hides the "Load real
  edition" tool + examples + sim scene buttons + `.foot` blurb, builds the appbar (Stop/Resume/Open,
  ◀ ▶ pan, ⦿ Auto-focus, ⚙ Settings), moves the brief under the stage, makes the budget+research a
  staff card.
- **`people` layer (the alive floor)** — `people = CAST.map(...)` with per-staffer state machine in
  `updatePeople()`: `idle`/`walk`/`sit`/`work`/`handoff`/`chief`. `drawPeople()` draws standing/
  walking bodies, the coffee mug (raised arm), the cigarette+ember (smoke beat), the carried page
  (handoff), and the "?" bubble (chief visit). `setWorking(s)` drives in-person handoffs;
  `askChief(agent)` sends someone to the office; `setFollow(on)` = auto-focus vs free-look.
- **Front page overlay** — `#frontpage` with `fpHead/fpStand/fpByline/fpBody/fpSources/fpAlso` +
  `fpOpen`/`fpClose`. `fpRenderEdition(edition)` renders the lead story fully (citation tokens →
  `[n]` superscripts via `FP_CITE`/`FP_STRAY`, sources numbered by order). **Note:** a source's
  `signalId` includes the `research:` prefix (e.g. `research:1a2b3c4d5e6f`) — it must match the
  citation token verbatim.
- **Clarification flow** — `applyRunResult(r)` branches ok / `needsClarification` / error.
  `askClarification()` shows the Chief query + "Answer the Chief" box + `pendingClarify`.
  `answerChief()` resumes via `answerClarification`. Stage banner drawn by `waitBanner()` when
  `pendingClarify`.
- **Research depth** — `RESEARCH_LEVELS = {light:{research:1,maxFindings:3}, standard:{…6}, deep:{
  research:2,maxFindings:10}}`, `researchKey`, `researchOpts()`. The `#researchLevel` select is in
  the budget card; passed on both run and answer.

## 7. How to verify prototype changes (READ THIS — it has real gotchas)

The Electron app can't be driven interactively from here, so the prototype is verified in the
**Browser pane** by injecting a temporary mock of `window.lateEdition`:

1. Insert a `<script id="__mock_bridge">…</script>` **immediately before** the main
   `<script>\n(() => {` line (there's no `</head>`, so that's the anchor). Define
   `window.lateEdition` with the methods you're exercising (`detect`, `staff`, `getRoot`, `run`,
   `answerClarification`, `onEvent`, `halt`, …). See any recent commit's diff for the shape.
2. Navigate the Browser pane to `file:///D:/Late-Edition/docs/prototype/newsroom-screen-test.html`,
   dismiss the start gate (`document.querySelector('.startgate').hidden = true`), drive the UI.
3. **REMOVE the mock before committing.** `grep -c __mock_bridge <file>` must be **0**. Same for any
   `window.__X` debug lines you added.

**Gotchas:**
- **RAF pauses when the pane is hidden** — the animation only advances when a screenshot is taken.
  So polling JS between screenshots shows frozen state; take screenshots to advance frames.
- **Closure variables** (`state`, `people`, `cam`, staff…) aren't on `window` — expose them with a
  temporary `window.__X = …` line to inspect, then remove.
- **Pixel probes** beat eyeballing: read `#screen` `getImageData` and count colored pixels to prove
  a body/prop rendered (the canvas often sits below the pane fold; screenshots scale down).
- **`position:fixed` is trapped** by the stage's transform; to view the front page full-size, move
  it to `document.body` first.
- **CSS collisions**: the global `.card{display:flex}` and the flex-row `body` bit us — scope new
  classes and check computed styles.

## 8. Hard invariants / lessons

- **git is LOCAL ONLY.** No remote, no push, ever.
- **ESM preload doesn't load in Electron** → `preload.cjs` is CommonJS; `postbuild` copies it; a
  missing bridge silently drops the app into sim mode (LE_DEBUG catches it).
- **Desks must never cover the office frontage** (the clear middle strip in front of the Chief).
- **Windows**: agent CLIs install as `.cmd`; the provider layer wraps `cmd.exe /c` + a PATH check.
- **Never store credentials** — auth lives in each agent's own CLI (`claude auth login`); Setup
  just writes `staff.yaml` (which provider/model per role).
- **Citations**: only literal signal ids resolve; the writer prompt forbids `[#1]`/`[ref]`; the
  renderer scrubs strays. Keep that contract if you touch prompts or rendering.

## 9. Pending / next steps

- **David's next test:** re-run a real edition on **Deep** research, then open the front page /
  "Open the paper" to judge the now-fuller article. If still thin, the next lever is the
  reporter/editor prompts (sharper angle, more analysis) — not yet tuned.
- **Tune by eye** (needs David watching a live real run): wander cadence, quip frequency, and
  chief-visit frequency in the `people` layer.
- **Possible follow-ups:** a "ring the next agent" (phone) handoff variant; wiring the mid-run
  decision walks to an actual user prompt (currently they're visual + logged, non-blocking; only
  the clarification path truly pauses).
- See [`memory/app-feedback-backlog.md`](memory/app-feedback-backlog.md) for the full punch-list
  (all Passes 1–3 + alive-world + output-depth items are ✅).

## 10. Quick start for the next session

```bash
cd D:/Late-Edition           # (or wherever it's cloned at home)
git log --oneline -15        # newest work is at the top of `main`
npm install                  # if fresh checkout
npm run check                # confirm 71 tests green
npm run app                  # launch and file a real edition
```

Then read, in order: this file → `memory/app-feedback-backlog.md` → the prototype file's real-mode
section (search `window.lateEdition`) → `src/electron/main.ts` IPC handlers.
