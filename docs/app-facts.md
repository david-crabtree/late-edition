# App facts

What Late Edition actually is, read off the code and the running app rather than the
planning documents. **Nothing goes in any piece of copy unless it is in here.**

The planning documents predate the build. Where they disagree with the code, the code wins
and the difference is noted below.

Verified 11 September 2026 against the working tree at commit `7161aef`, by reading the
source and running the app and the command line on Windows 11.

---

## Identity

| | |
| --- | --- |
| Product name | Late Edition |
| Package name | `late-edition` |
| Version | 0.0.1 |
| Window title | Late Edition |
| Masthead in app | LATE EDITION · "Your agents · your paper" |
| Own one-liner | "A noir newsroom that turns your own AI agents into a daily paper." |
| Default paper name in a new newsroom | The Daily Bit · "All the code that's fit to print" |

The app's own description of itself, from the Setup panel: *"Late Edition doesn't run any AI
itself. Each desk is handed to an agent you have already installed and signed into on this
machine."*

---

## Providers

Six real adapters plus an offline stand-in. Every one is fully implemented: a real `run()`
that spawns the command line or calls the API, parses the response, and reports its own
errors. None is a stub.

| Provider | Status | How it is driven | Notes |
| --- | --- | --- | --- |
| Claude Code | **Proven** end to end | `claude -p --output-format json` | Real editions filed on a Claude subscription. Reports token usage and its own USD cost. Can browse. |
| Codex CLI | Untested | `codex exec --json` | Written, detected, never confirmed against a live install. |
| Gemini CLI | Untested | `gemini -p --output-format json` | Same. Can browse. |
| OpenCode | Untested | `opencode run --quiet` | Same. Model names take the form `provider/model`. |
| Ollama | Untested | HTTP to `localhost:11434` | Local models, no cost, cannot browse. Reports the models actually installed. |
| Direct API | Untested | HTTP, OpenAI or Anthropic shaped | Key read from `LATE_EDITION_API_KEY`. The app never holds it. |
| Offline stand-in | Works | nothing | A dry run. Writes a whole paper without contacting any model, and every word of it is invented. Hidden from Setup unless asked for. |

**"Untested" means our evidence, not missing code.** Say it that way in copy, or it reads as
"not implemented".

Live on the verification machine: Claude Code ready (v2.1.251, plan usage), everything else
not installed.

**Providers are configured per desk**, not globally, so a newsroom can put a cheap model on
research and a strong one on the editor. Six desks make their own agent call: triage,
researcher, reporter, writer, editor, copy desk, plus the picture desk when switched on.

---

## Source adapters

Six, all registered and working:

- `rss` — any feed.
- `git_local` — commits in a local repository.
- `github` — a repository's activity over the API.
- `web_diff` — fetches a page and reports what changed since last time.
- `folder` — files appearing or changing in a directory.
- `ics` — calendar events.

---

## Distribution

Four channels, all registered. Opt-in: a run sends nothing unless asked with `--distribute`
or `auto_send: true`.

- Slack, Teams, generic webhook, RSS.

Secrets stay out of the config file. Each channel names an environment variable that holds
its webhook URL.

---

## The edition cycle, from the pipeline code

Twelve stages: `WIRE, ASSIGN, TRIAGE, RESEARCH, REPORT, ANGLES, CALL, WRITE, CHECK, PROOF,
PRESS, DONE`. State is written to disk after every one, so a run can be resumed.

- **WIRE** polls every source and forms one provisional story per beat.
- **TRIAGE** is the Chief deciding whether a brief is clear enough to run, and asking if not.
- **RESEARCH** gathers sourced findings. Every finding becomes a signal with an id, which is
  what makes the citation contract enforceable later.
- **REPORT** commissions one to three reporters per story. A desk that does not trust its own
  reporting can stop here and ask whether to dig again.
- **ANGLES / CALL** is the editor choosing a line, or running Competing Takes when reporters
  genuinely disagree rather than silently merging them.
- **WRITE** turns the chosen angle into copy. The picture desk runs here when switched on.
- **CHECK** is the copy desk verifying every claim resolves to a real cited signal. Anything
  that does not is cut and listed under Corrections.
- **PROOF / PRESS** assemble and render the paper.

**All of it survived the build.** Angles, Competing Takes, the copy desk, stop the press,
tripwires and Late Extras are all real and all reachable.

### Things the spec did not anticipate

- **The field desk.** Ida Stringer watches the pages a finished story came from and reports
  when one moves. Checking costs nothing — the adapters fetch and diff with no model
  involved — so tokens are only spent when you ask for a follow-up.
- **Outlets.** Eleven of them. The house paper plus a red-top, a broadsheet, a business
  daily, an agency wire, a tech site, a blog, a newsletter, LinkedIn, Reddit and a plain
  brief. The choice reaches the reporter and the editor as well as the writer, so the angle
  and the headline move with it, not just the voice. It never touches the research.
- **Standing assignments** that run on a cadence and build on their own past coverage.
- **The morgue**, a searchable archive of past editions, linked into new stories.

---

## Characters

Eight on the floor plus the Chief. These exist in the interface with names, portraits,
desks and their own one-liners.

| Name | Desk |
| --- | --- |
| The Chief | Assigns the work and makes the call |
| Ruth Ledger | Researcher |
| Sam Vance | Hardboiled reporter |
| Dot Banner | News editor |
| Hal Brevier | Rewrite / copywriter |
| Mac Stet | Copy desk |
| Gus Dash | Copy boy |
| Ida Stringer | Field reporter |
| Iris Plate | Photo desk |

**Only one persona file ships**, `newsroom/staff/sam-vance.md`. The other names live in the
interface only, and every story is bylined by the reporter on its beat, which is Sam in a
fresh newsroom. Do not imply the cast write in eight different voices. They do not yet.

The byline is not printed in the rendered edition. Crediting a person who does not exist as
the author of something a reader might take for journalism was the one claim in the output
that was flatly untrue.

---

## Config

### Per newsroom, in `newsroom/`

`config.yaml` — `paper.name`, `paper.tagline`, `paper.timezone`, `schedule.daily_at`,
`edition.max_page_one`, `edition.urgency_threshold`, `edition.token_cap`,
`distribution.auto_send`, `distribution.channels`.

`staff.yaml` — provider and model per desk. `style.md` — the house voice.
`beats/*.yaml`, `assignments/*.yaml`, `staff/*.md`, `prompts/*.md` for overrides.

### Per install, in `le-config.json` under the user's app data

`root` (which newsroom folder is open), `fieldDesk` (on by default), `noticeAccepted`.

### Keys the rollout plan specifies that **do not exist yet**

- `donations.enabled` — nothing in the app mentions donations at all. There is no sponsor
  link, no Help menu item, no footer line, no tenth-edition prompt.
- `updates.enabled` — there is no auto-update. `electron-updater` is not a dependency and
  nothing checks for a new version.

Copy must not claim either.

---

## Platform status

| | Configured | Actually built | Auto update | First launch |
| --- | --- | --- | --- | --- |
| Windows | NSIS installer + portable, x64 | **Yes**, both produced | None | Unsigned. SmartScreen warns; Smart App Control may block outright. |
| macOS | dmg, x64 + arm64 | **No, never built** | None | Unverified. No ad-hoc signing step exists yet, so Apple Silicon may report it as damaged. |
| Linux | AppImage + deb | **No, never built** | None | Unverified. |

**Only Windows has ever been produced and run.** Copy must not offer macOS or Linux
downloads until they exist and somebody has opened one.

---

## Command line

`late-edition <command>`: `detect`, `init`, `run`, `distribute`, `watch`, `assignment`,
`halt`, `search`, `styles`, `help`, `version`.

Notable flags on `run`: `--provider`, `--brief`, `--resume`, `--cap`, `--research`,
`--style`, `--length`, `--answer`, `--no-clarify`, `--distribute`, `--dry-run`.

---

## The things that make it worth writing about

Verified, and true of the current build:

1. **Citations resolve or they die.** An agent cites by writing a source's literal signal id.
   Only real ids become footnotes; invented markers like `[#1]` are scrubbed by the renderer.
   A story cannot cite a source the researcher never found.
2. **A desk with no agent stops the run.** Desks start unset. An empty one halts and names
   itself rather than quietly filling the paper with invented copy.
3. **Every artefact is a plain file.** Markdown, JSON and YAML in a folder you can open,
   grep, back up and commit.
4. **Nothing leaves the machine except to the sources and the agents.** No servers, no
   accounts, no analytics, no telemetry of any kind. Verified by absence: nothing in the
   source posts anywhere but a configured source, a configured distribution webhook, or the
   user's own agent.
5. **Every rendered edition carries a notice** saying it is machine-produced, not journalism,
   and to check the sources before relying on it. It is written into the files, not just
   shown on screen, so it survives being copied elsewhere.

---

## External facts, checked on 11 September 2026

| Claim | Source | Result |
| --- | --- | --- |
| SignPath Foundation free signing needs an OSI-approved licence | signpath.org terms | Confirmed. Requires "an OSI-approved Open Source license without commercial dual-licensing for all components". Apache 2.0 with the Commons Clause does not qualify. |
| GitHub account `david-crabtree` exists | api.github.com | Confirmed, id 97316628, created January 2022. |
| Apache License 2.0 text | apache.org/licenses/LICENSE-2.0.txt | Fetched verbatim into `LICENSE`; diffed, only the appendix notice differs. |

### Still to verify before any copy claims it

- Provider CLI install commands and non-interactive flags, per provider, against their
  current documentation. Only Claude Code's has been exercised.
- Windows SmartScreen and Smart App Control behaviour on current builds of Windows 11.
- macOS first-launch behaviour for an unsigned and for an ad-hoc signed app on current
  macOS. Nothing has been built for macOS at all.
- Any comparable tool named in a launch post.

---

## Files the handoff expects that are not in the repo

`late-edition-build-plan.md` and `late-edition-launch-kit.md` are named in the copy handoff
but are not present. `docs/build-plan.md` exists and is the original build plan.
There is no launch kit, so its "structure and tone" cannot be followed — the launch copy
will follow the rollout plan's section 7.2 instead.
