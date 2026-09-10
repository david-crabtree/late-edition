# Late Edition

**A noir newsroom that turns your own AI agents into a daily paper.**

Late Edition is a free, open-source desktop app that wraps the AI coding-agent CLIs you
already pay for — Claude Code, Codex, Gemini CLI, OpenCode, local models via Ollama, and
more — and turns them into the staff of a 1940s newspaper. Field reporters investigate
_your_ sources (repos, inboxes, competitor sites, subreddits, RSS, logs), file competing
angles on the same story, and a managing editor makes the call. You, the editor in chief,
read the paper before it goes to your team.

- **Local first.** Everything runs on your machine. There is no server we operate.
- **Unstaffed by default.** A fresh newsroom has no agents wired to any desk. A desk with
  nobody on it stops the run and says so, rather than filling the paper with invented copy.
- **Bring your own agent.** We shell out to CLIs you've already authenticated. We store no
  API keys of yours beyond ones you explicitly choose to add.
- **Every artefact is a plain file.** Editions, reports, and config are Markdown, JSON and
  YAML in a folder you can open, grep, back up and commit.
- **Provider neutral.** Claude, OpenAI, Google, local models — all first class.
- **MIT licensed.** Free and open source, contributor friendly from day one.

> Status: early. See [`docs/architecture.md`](docs/architecture.md) for how it's put
> together, [`docs/build-plan.md`](docs/build-plan.md) for the full vision, and
> [`docs/decisions.md`](docs/decisions.md) for what's actually been decided.

## Installing

Download the build for your platform from the
[Releases page](../../releases). No Node, no command line, no npm.

**Windows will warn you the first time.** The build is not code-signed yet, so you'll get a
blue "Windows protected your PC" panel. Click **More info**, then **Run anyway**. Checksums
are published with every release if you'd like to verify the download first. On Windows 11,
Smart App Control may block it outright rather than warn; turning it off, or waiting for a
signed build, are the only ways round that. Mac builds
aren't available yet — see [`docs/releasing.md`](docs/releasing.md) for why.

You'll also need at least one AI agent CLI installed and signed in, since Late Edition
doesn't run any AI itself. The Setup panel inside the app detects what you have and tells
you exactly what to run for anything you don't.

## How it works

An **edition** moves through an explicit pipeline, and every stage writes files so a
crashed run can resume:

```
WIRE → ASSIGN → REPORT → ANGLES → CALL → WRITE → CHECK → PROOF → PRESS
```

- **Source adapters** (`rss`, `git_local`, `github`, `web_diff`, `folder`, `ics`) do pure
  fetch-and-diff and emit `Signal`s. No LLM.
- **Agent providers** (`claude`, `codex`, `gemini`, `opencode`, `ollama`, direct API, and a
  `fake` provider for testing) run the reporters, writers, editor and copy desk.
- **Multiple angles**: commission two or three reporters (ideally different providers) per
  story; when they disagree the paper runs **Competing Takes** instead of silently merging.
- Every claim in the paper is traceable to a source signal. Unverifiable claims are cut
  and listed under **Corrections**.
- **Stop the press**: a corroborated, urgent finding is promoted to page one; between
  editions, `late-edition watch` fires a **Late Extra** bulletin when a tripwire matches.
- **Distribution**: `--distribute` sends the approved edition to Slack, Teams, a webhook, or
  an RSS feed — so teammates get the paper without the app.
- **The morgue**: `late-edition search <query>` searches past editions; each story links to
  related past coverage.

## What this is not

Read this before you use anything it writes.

Late Edition lays AI output out as a newspaper. **The newspaper is a presentation style, not
a claim that the contents are true.** No reporter wrote it and no editor checked it.

- **It can be wrong, and it can invent things**, including sources that look real. Every
  edition is an unchecked draft. Verify it against the listed sources before you rely on it,
  republish it, or present it as fact. Every rendered edition carries this notice in the file
  itself, so it travels with the copy.
- **It is not journalism, and it is not advice** — not legal, medical, financial or
  professional advice of any kind.
- **The usage is yours.** Agents run under your own accounts. Work counts against your own
  plan allowance, or is billed to your own API key, and we can neither see nor cap it. You are
  responsible for that spend and for complying with your AI provider's terms.
- **No warranty, no liability.** This is free software provided as-is under the
  [MIT licence](LICENSE). The authors accept no responsibility for what it produces or for
  anything done with it.

## Quick start from source (the engine, headless)

Requires Node.js 20+.

```bash
npm install
npm run cli -- --help
```

Scaffold a newsroom and run an edition with the built-in **fake provider** (no tokens
spent, no CLIs required):

```bash
npm run cli -- init ./my-newsroom
npm run cli -- run --newsroom ./my-newsroom --provider fake
```

The result lands in `my-newsroom/editions/<date>-NNN/` as `edition.md` and `edition.html`.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Adding a source adapter or an agent provider is
meant to take a single file — that's a design goal, not an aspiration.

## Licence

[MIT](LICENSE).
