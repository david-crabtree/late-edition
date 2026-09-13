# LATE EDITION
### A noir newsroom that turns your own AI agents into a daily paper

Working title. Rename freely. Free to use; Apache 2.0 with the Commons Clause.
(This line said MIT when the plan was written; it became Apache 2.0 with the Commons Clause and then, on 13 September 2026, AGPL-3.0 — see `decisions.md` DR.1 and DR.5.)

This document is the original build plan. Read it fully before writing code. Where a detail is marked VERIFY, check it against the real tool at build time rather than trusting this document. Where something is marked DECIDE, make the call, write it in `docs/decisions.md`, and move on.

---

## 1. The one paragraph pitch

Late Edition is a free desktop app that wraps the AI coding agent CLIs a person already pays for (Claude Code, Codex, Gemini CLI, Grok, Copilot CLI, OpenCode, local models via Ollama) and turns them into the staff of a 1940s newspaper. Field reporters go out and investigate the user's own sources: repos, support inboxes, competitor sites, subreddits, RSS, logs. They file multiple angles on the same story. A managing editor makes the call. Writers can stop the press when something urgent turns up. The user, as editor in chief, reads the paper before it goes to their team. It looks like a LucasArts point and click adventure. No backend, no subscription, no data leaves the machine except what the user's own agents already send to their own providers.

The lesson from multi-agent harnesses that people actually enjoy using: the fun is the hook, the orchestration is the product, and BYO agent is what makes it free to run.

---

## 2. Non negotiables

1. Local first. Everything runs on the user's machine. The app never talks to a server we operate. There is no server we operate.
2. Bring your own agent. Zero API keys stored by us beyond optional plain provider keys the user chooses to add for Ollama or direct API use. Primary path is shelling out to CLIs the user has already authenticated.
3. Every artefact is a plain file. Editions, stories, reporter notes and config are markdown and JSON in a folder the user can open, grep, back up and commit to git.
4. Provider neutral. Claude, OpenAI, Google, xAI, GitHub and local models are all first class. We do not personally use most of them. They still ship day one.
5. The paper must be better than the six tabs it replaces. If the front page is not useful the art is a costume. Every design decision is judged against "would a busy person open this tomorrow".
6. No paid dependencies. No SaaS in the build chain except free tiers we can live without.
7. Free to use, at home or at work. Apache 2.0 with the Commons Clause, so nobody can
   sell it. Contributor friendly repo from day one.

---

## 3. The fiction, and how it maps to the system

| Fiction | System role | Who runs it |
|---|---|---|
| Editor in chief | The user. Reads the edition, approves, spikes, sends to print. | Human |
| Managing editor ("Mac") | Orchestrator. Assigns beats, collects angle memos, picks the angle, writes the front page hierarchy. | One agent call per edition, ideally the strongest model the user has |
| Field reporters | Source gatherers. Each has a beat and a persona. They fetch, diff, read and write a filed report with facts and a proposed angle. | Cheaper models. Can run in parallel across providers |
| Rewrite desk / writers | Turn filed reports and the editor's chosen angle into finished copy in house style. Can raise a "stop the press" flag. | Mid tier models |
| Copy desk | Fact check against the raw source material, enforce style, flag unsupported claims. | Cheap model, strict prompt |
| The morgue | Archive of every edition, story and filed report. Searchable. | SQLite index over the files |
| The wire | Incoming raw signals before anyone has looked at them. | Source adapters |
| The press | Distribution. Slack, Teams, email, static HTML, RSS out, markdown. | Plain outbound integrations |

The user never has to know any of this. They configure beats, meet their staff, and read the paper.

---

## 4. Core mechanics

### 4.1 Beats

A beat is a named subject with one or more sources and an assigned reporter. Examples:

- "The Codebase": a git repo (local path or GitHub). Reports on commits, PRs, issues, CI failures, dependency releases.
- "Customer Desk": an IMAP inbox or a support export folder. Reports on volume, recurring complaints, the three angriest emails.
- "The Competition": a list of URLs. Diffs pricing pages, changelogs, blog feeds.
- "The Street": subreddits, Hacker News, Product Hunt, forums via RSS.
- "City Hall": internal sources. Team wiki folder, Slack export, calendar ICS, Jira or Linear via their free APIs if the user provides a token.
- "The Wires": any RSS or Atom feed.

Beats are defined in `newsroom/beats/*.yaml`. Each references one or more source adapters and one reporter persona.

### 4.2 Source adapters

Pure fetch and diff. No LLM. Each adapter returns a list of `Signal` objects: timestamp, source id, title, body (plain text), url, raw hash. Adapters remember what they have seen and only emit new or changed items.

Ship these in v1:

- `rss`: any feed. Covers most of the web.
- `git_local`: log, diff stats, branch activity on a local path.
- `github`: public repos with no token, private with a PAT. Issues, PRs, releases, workflow runs. Use the REST API directly, no SDK.
- `web_diff`: fetch a URL, extract readable text, diff against last snapshot.
- `imap`: read only. Subject, sender, first N lines. Never marks read, never deletes.
- `folder`: watch a local directory for new or changed files. Covers exports, logs, notes, anything.
- `ics`: calendar files or URLs.

Design the adapter interface so a contributor can add Linear, Jira, Sentry, Stripe or anything else in one file.

### 4.3 The edition cycle

An edition is one paper. Default is one per day at a user chosen time, plus on demand.

```
WIRE        Adapters run, new signals land in wire/
ASSIGN      Managing editor groups signals into candidate stories and assigns
            reporters. Trivial signals go to "Briefs" with no reporter.
REPORT      Reporters investigate in parallel. Each files a report:
            facts, sources, quotes, a proposed angle, a confidence score,
            and an urgency score.
ANGLES      For any story with 2+ reporters, or any story the editor flags
            as important, multiple angle memos exist. These are kept.
CALL        Managing editor reads all filed reports, picks the angle for
            each story, decides page placement, kills weak stories, writes
            the editor's note. Disagreements between reporters are surfaced
            as a "Competing Takes" sidebar rather than silently resolved.
WRITE       Rewrite desk produces final copy per story in house style.
CHECK       Copy desk verifies every claim maps to a source in the filed
            reports. Unsupported claims are cut or marked.
PROOF       The user reads the edition in the app. Can spike stories,
            reorder, add a note, ask a reporter to dig deeper (which
            re runs REPORT for that story only).
PRESS       User approves. Edition is rendered and distributed.
```

Every stage writes files. A crashed edition can resume from the last completed stage.

### 4.4 Multiple angles

This is the feature that makes the output trustworthy. For each story the managing editor may assign two or three reporters, ideally from different providers. Each returns an independent angle memo without seeing the others. The editor then either:

- picks one and notes why in the editor's log,
- merges facts from several into one piece, or
- runs the story as "Competing Takes" with both angles side by side.

The user can set a per beat policy: `angles: 1 | 2 | 3` and `mix_providers: true`. Mixing providers is the recommended default for anything the user marks as high stakes, because different models disagree in useful ways.

### 4.5 Stop the press

Two flavours.

**During an edition.** Any reporter or writer that scores a finding above the urgency threshold emits a `STOP_THE_PRESS` event with a one line reason. The pipeline pauses at the next safe point, the press room animation halts, and the user gets an interrupt card: the finding, who raised it, and three buttons: "Run it on page one", "Fold it into the edition", "Not news, carry on". The urgency threshold is configurable per beat and the copy desk must corroborate before the interrupt fires, to avoid crying wolf.

**Between editions.** Watchers can run lightweight adapter polls on a schedule. If a signal matches a user defined tripwire (regex, keyword, source, or a cheap model classification) a single reporter is dispatched immediately and the user gets a "Late Extra": a one story bulletin outside the daily cycle.

### 4.6 Distribution ("the masses")

Once the editor in chief approves, the edition goes out through any enabled channels:

- Static HTML edition, styled as a real newspaper page. Also the in app view.
- Markdown edition in the editions folder.
- Slack incoming webhook.
- Microsoft Teams incoming webhook.
- Email via the user's SMTP settings.
- RSS feed served from the local folder, so a team can subscribe with any reader.
- Copy to clipboard.

Team members receive the paper. They do not need the app. Team mode where several people share a newsroom is out of scope for v1 but the file based design should not prevent it.

---

## 5. Agent provider layer

This is the part most likely to rot. Treat every flag below as VERIFY.

### 5.1 Adapter interface

```ts
interface AgentProvider {
  id: string;                   // "claude", "codex", "gemini", "grok", "copilot", "opencode", "ollama"
  displayName: string;
  detect(): Promise<Detection>; // is the CLI installed and authenticated
  run(job: AgentJob): AsyncIterable<AgentEvent>;
  capabilities: {
    webSearch: boolean;         // can the agent browse on its own
    fileAccess: boolean;
    jsonOutput: boolean;
    streaming: boolean;
    models?: string[];
  };
}

interface AgentJob {
  role: "reporter" | "writer" | "editor" | "copydesk";
  systemPrompt: string;
  userPrompt: string;
  workingDir: string;           // a scratch dir containing the materials for this job
  outputSchema?: JSONSchema;    // when we need structured output
  timeoutMs: number;
  budget?: { maxTokens?: number };
}
```

### 5.2 Providers to ship

| Provider | CLI | Non interactive invocation to VERIFY | Notes |
|---|---|---|---|
| Anthropic | `claude` (Claude Code) | `claude -p "<prompt>" --output-format json` | Supports `--model`, allowed tools flags |
| OpenAI | `codex` | `codex exec "<prompt>"` | Check JSON output flag and sandbox flags |
| Google | `gemini` | `gemini -p "<prompt>"` | Check model flag |
| xAI | `grok` CLI | VERIFY exists and syntax | If no official CLI, support via direct API with user key |
| GitHub | `copilot` CLI | VERIFY non interactive mode | May be limited; degrade gracefully |
| OpenCode | `opencode` | `opencode run "<prompt>"` | Multi provider itself |
| Local | Ollama | HTTP to `localhost:11434` | No CLI needed, use REST |
| Direct API | any | HTTPS with user key | Fallback for anything without a usable CLI |

Rules:

- Detection runs on first launch and on demand. The app shows a "staff available" screen: which providers are installed, authenticated, and what they can do. Missing ones show install instructions, nothing more.
- Never store provider credentials ourselves when a CLI is present. The CLI owns auth.
- Every job runs in a scratch directory containing only the materials for that job. Agents with file access must not be pointed at the user's home directory.
- Structured output: where the CLI supports a JSON output mode use it. Where it does not, wrap the prompt with a strict "respond with only this JSON" instruction and parse defensively with repair. Retry once on parse failure with the error appended.
- Cost hygiene: reporters get a token budget and a timeout. The editor gets a bigger one. Show per edition token usage per provider in the app. The user is paying for these tokens through their own subscriptions and deserves to see it.
- Concurrency: configurable, default 3 parallel jobs. Respect that most subscriptions have hourly limits.

### 5.3 Role assignment

`newsroom/staff.yaml` maps roles to providers and models. Example default the app writes on first run, based on detection:

```yaml
managing_editor:
  provider: claude
  model: best_available
reporters:
  default: { provider: codex }
  the_codebase: { provider: claude }
  the_competition: { provider: gemini }
writers:
  default: { provider: claude }
copy_desk:
  provider: ollama
  model: llama3.2      # cheap, local, strict
```

Users can drag staff between desks in the UI. Underneath, that edits this file.

---

## 6. Personas and house style

Every staff member has a persona file in `newsroom/staff/<name>.md`: name, beat, voice, a short bio, and a sprite id. Personas affect writing voice and the little lines of dialogue in the newsroom scene. They must never affect factual content. The copy desk exists to enforce that.

House style lives in `newsroom/style.md`. Defaults to a terse, wry, 1940s wire service voice. Users can rewrite it entirely. Corporate teams will want plain and neutral. Provide two presets: "Noir" and "Plain".

Ship a default staff of six with distinct voices. Names and bios are the fun bit and should be written with care. Avoid real people and avoid anything that reads as a parody of a specific existing character.

---

## 7. The paper itself

The edition is the product. Structure:

```
MASTHEAD        Paper name (user chosen), edition number, date, weather
                line (a one liner from the editor about the day's mood)
PAGE ONE        1 to 3 lead stories, each: headline, standfirst, body,
                sources, byline, the angle that was chosen and why
COMPETING TAKES Stories where reporters disagreed, both angles shown
BELOW THE FOLD  Everything worth knowing that is not urgent
BRIEFS          One line items. Dependency bumps, minor commits, quiet
                competitor changes
THE MORGUE      Links to related past coverage
CORRECTIONS     Anything the copy desk changed or cut, and why
EDITOR'S LOG    Managing editor's notes on judgement calls
```

Every claim links to its source signal. Hover or tap shows the raw material. If the copy desk could not verify a claim it is cut from the body and listed in Corrections with the reporter's name. This transparency is a feature, not an apology.

---

## 8. Visual design

### 8.1 Style

Late 80s and 90s LucasArts point and click. Reference the feel of Thimbleweed Park and Full Throttle without copying any character, room, logo or asset. Original art only.

- Base resolution 640 x 360, integer scaled to the window. Crisp nearest neighbour scaling, no smoothing.
- Limited palette. A noir palette of around 32 colours: deep blues and blacks for shadows, warm amber for lamps and the press, one hot accent (red for stop the press). Dithering for gradients.
- Characters roughly 48 to 64 px tall, 3/4 view, idle and walk cycles, a few emotes: typing, phone, thinking, running with paper.
- Text in the UI panels uses a pixel font. Body text of the paper itself uses a real serif at normal resolution because people have to read it.

### 8.2 Rooms

1. **The Newsroom.** The main screen. Desks for each staff member. Reporters not in the room are "out on a story" and their desk is empty. Clicking a desk opens that reporter's filed reports and lets you talk to them (send a prompt in character, get an answer). The wall clock shows time to next edition. A ticker along the bottom shows wire items arriving.
2. **The Editor's Office.** Where the user reads the proof. Big desk, the paper laid out on it, red pencil verbs: Spike, Move up, Move down, Dig deeper, Add note, Approve.
3. **The Press Room.** Plays when an edition prints. Machine animation, papers stacking. Stop the press halts it with the big red lever. Distribution status shown here.
4. **The Street.** Optional. A small exterior scene where reporters visibly leave and return. Purely cosmetic and a good place for personality. Can be a later milestone.
5. **The Morgue.** Archive. Filing cabinets. Search past editions and stories.

### 8.3 Interaction

Verb driven where it makes sense, but do not build a full SCUMM verb bar. Hover highlights, click to act, right click for a short context menu. Dialogue appears as pixel speech bubbles above heads. Keyboard shortcuts for everything the editor does often.

The whole scene must be optional. A "just show me the paper" mode renders the edition as a clean page with no game frame. Accessibility and busy people both need this.

### 8.4 Asset pipeline

- Source art in Aseprite, exported to sprite sheets with JSON atlases. Commit both.
- Until real art exists, generate labelled placeholder sprites programmatically (coloured rectangles with names). The whole app must work with placeholders so art and code can proceed in parallel.
- Art brief in `docs/art-brief.md` listing every sprite, animation and room with dimensions and frame counts, so an artist can pick it up cold.

---

## 9. Architecture

### 9.1 Stack

DECIDE between Electron and Tauri. Recommendation: **Electron** for v1. Reasons: spawning and streaming child processes is trivial in Node, the community of likely contributors knows it, and the CLI adapters are the riskiest code so keep them in the language with the least friction. Tauri is a fine later port if bundle size matters.

- Runtime: Electron, TypeScript throughout.
- Renderer: React for panels and the paper. PixiJS for the pixel scene. One canvas, DOM overlays for text.
- State: a small store (Zustand) fed by an event bus from the main process.
- Persistence: files on disk plus SQLite (better-sqlite3) as a search and index layer. SQLite is disposable and can be rebuilt from the files.
- Scheduling: node-cron in the main process. App must run in the tray or menu bar for editions to fire.
- Packaging: electron-builder for mac, Windows, Linux. Signed builds are a later problem.
- Tests: Vitest for units, Playwright for a smoke test of the edition flow with a fake provider.

### 9.2 Process layout

```
main process
  ├─ scheduler          cron, watchers, tripwires
  ├─ adapters/          source adapters, pure fetch and diff
  ├─ providers/         agent CLI wrappers
  ├─ pipeline/          the edition state machine
  ├─ store/             file IO, SQLite index
  ├─ distribute/        outbound channels
  └─ ipc               typed event bus to renderer

renderer
  ├─ scene/             PixiJS rooms, sprites, animation
  ├─ panels/            React: proof reader, staff, beats, settings
  ├─ paper/             edition renderer, shared with static HTML export
  └─ state/             store
```

### 9.3 Data layout on disk

```
~/LateEdition/                (user chooses location on first run)
  newsroom/
    config.yaml               paper name, schedule, distribution
    style.md                  house style
    staff.yaml                role to provider mapping
    staff/*.md                personas
    beats/*.yaml              beats and sources
  wire/                       raw signals, rotated after N days
  editions/
    2026-09-09-001/
      edition.json            structure and metadata
      edition.md              readable edition
      edition.html            rendered
      stories/<slug>/
        assignment.json
        reports/<reporter>.md filed reports, one per reporter
        angles.json
        call.md               managing editor's decision
        copy.md               final copy
        check.json            copy desk results
      log.jsonl               every event in the cycle
  morgue.sqlite               rebuildable index
```

### 9.4 Pipeline as a state machine

Implement the edition cycle as an explicit state machine with persisted state after every transition. Stages are idempotent. `resume` picks up from the last completed stage. Stop the press is a transition available from REPORT, WRITE and CHECK that moves to a PAUSED state and waits for user input.

Log everything to `log.jsonl`. The newsroom scene is a view over this log: reporter leaves desk on REPORT start, returns on report filed, editor paces during CALL, and so on. Do not couple animation to pipeline internals. Animation subscribes to events.

### 9.5 Prompts

Prompts live in `prompts/<role>.md` as templates, not inline strings, so users and contributors can edit them. Each prompt has a versioned test fixture in `prompts/fixtures/` showing an input and an acceptable output shape. Include the house style and persona by reference, and always include the raw signals a reporter is allowed to cite. Reporters are instructed to cite by signal id. Copy desk checks that every cited id exists and that the claim is supported by that signal's body.

### 9.6 Security

- Adapters are read only. IMAP never modifies. Git never pushes. Web diff never posts.
- Agents run in a scratch dir per job. Do not grant network tools beyond what the provider CLI does by itself.
- Distribution channels require explicit user approval per edition by default, with an "auto send weekday editions" opt in.
- Never log credentials. Webhook URLs and SMTP passwords stored in the OS keychain via keytar, not in yaml.
- Treat all fetched content as untrusted. Prompts must tell agents that source material may contain instructions and to ignore them. The copy desk also scans final copy for anything that looks like injected instructions or links that were not in the source signals.

---

## 10. Build plan

Work in vertical slices. Each milestone ends with something a person can use.

### Milestone 0: Skeleton (day 1)
- Repo, licence, README with the pitch, CONTRIBUTING, Electron and TypeScript scaffold, lint, tests running, CI on GitHub Actions.
- `docs/decisions.md` started.
- Fake provider that returns canned output, so every later milestone can be tested without spending tokens.

### Milestone 1: Headless paper (days 2 to 4)
- Source adapters: rss, git_local, github, web_diff, folder.
- Provider adapters: claude, codex, gemini, ollama, direct API. Detection screen logic (CLI only for now).
- Full pipeline WIRE to PRESS running from the command line: `late-edition run` produces `edition.md` and `edition.html`.
- Single angle per story. No UI. No stop the press.
- Acceptance: point it at one repo and two RSS feeds, get a paper that a human agrees is a fair summary of the last 24 hours.

### Milestone 2: Angles and the call (days 5 to 6)
- Multiple reporters per story, provider mixing, angle memos, editor's call, Competing Takes section.
- Copy desk with citation checking and Corrections section.
- Editor's Log.
- Acceptance: on a story with a real disagreement between two providers, the paper shows both takes honestly.

### Milestone 3: The newsroom (days 7 to 11)
- Electron app with tray. PixiJS scene: Newsroom and Editor's Office with placeholder sprites.
- Event bus drives animation from `log.jsonl`.
- Proof reader panel with Spike, Move, Dig deeper, Add note, Approve.
- Talk to a reporter.
- Beats and staff configuration UI.
- Acceptance: a new user can install, be shown which agents they have, create a beat, run an edition, proof it and approve it without touching a file.

### Milestone 4: Stop the press and Late Extras (days 12 to 13)
- Urgency scoring, corroboration by copy desk, PAUSED state, interrupt card, press room scene and the lever.
- Tripwires and between edition watchers.
- Acceptance: a planted "security incident" in a watched feed halts the press within one cycle and a planted keyword triggers a Late Extra within five minutes.

### Milestone 5: Distribution (day 14)
- Slack, Teams, email, RSS out, static HTML export, clipboard.
- Per edition send confirmation, auto send opt in.

### Milestone 6: Polish and release (days 15 to 18)
- Real art drop in, Street and Morgue rooms.
- "Just the paper" mode.
- Onboarding: first run wizard, sample beats, a demo edition generated from the fake provider so the app is not empty.
- Packaging for three platforms.
- Docs: how to add a source adapter, how to add a provider, how to write a persona.
- Ship. Product Hunt, Hacker News, r/ClaudeAI, r/LocalLLaMA.

Days are rough. Do not pad. If a milestone is done early move on.

---

## 11. Definition of done for v1

- Works with at least three real providers and Ollama.
- Produces a daily edition from at least five adapter types.
- Every claim in the paper is traceable to a source.
- Stop the press works end to end.
- A team member with no app installed can receive the paper via Slack, Teams, email or RSS.
- A contributor can add a source adapter in under an hour using the docs.
- Runs with zero network calls other than the user's own sources and the user's own agent providers.
- Placeholder art fully replaced in Newsroom, Editor's Office and Press Room.

---

## 12. Things to avoid

- Do not build a chat UI. This is not a chatbot with a hat on. The interface is the newsroom and the paper.
- Do not silently merge reporter disagreements. Surface them.
- Do not let personas change facts.
- Do not require an account, ever.
- Do not ship anything that copies a real game's characters, fonts, or rooms.
- Do not make the fun parts mandatory. The paper must stand on its own.
- Do not invent CLI flags. VERIFY every one against the installed tool and fail with a clear message if a provider's CLI has changed.

---

## 13. Instructions for the build agent

1. Read this document twice. Then read the current docs of each provider CLI and record the verified invocation syntax in `docs/providers.md` before writing adapters.
2. Build the fake provider first and use it for everything until Milestone 1 acceptance, then spend real tokens.
3. Commit small. Every milestone gets a tag.
4. Keep `docs/decisions.md` honest, including things you tried that did not work.
5. When a design choice here conflicts with something you learn while building, prefer the thing you learned, write it down, and keep going. Do not stall waiting for a human unless the choice changes the non negotiables in section 2.
6. Dogfood. Point the app at its own repo as the first beat. The paper should report on its own construction.
