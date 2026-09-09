# Late Edition

**A noir newsroom that turns your own AI agents into a daily paper.**

Late Edition is a free, open-source desktop app that wraps the AI coding-agent CLIs you
already pay for — Claude Code, Codex, Gemini CLI, OpenCode, local models via Ollama, and
more — and turns them into the staff of a 1940s newspaper. Field reporters investigate
_your_ sources (repos, inboxes, competitor sites, subreddits, RSS, logs), file competing
angles on the same story, and a managing editor makes the call. You, the editor in chief,
read the paper before it goes to your team.

- **Local first.** Everything runs on your machine. There is no server we operate.
- **Bring your own agent.** We shell out to CLIs you've already authenticated. We store no
  API keys of yours beyond ones you explicitly choose to add.
- **Every artefact is a plain file.** Editions, reports, and config are Markdown, JSON and
  YAML in a folder you can open, grep, back up and commit.
- **Provider neutral.** Claude, OpenAI, Google, local models — all first class.
- **MIT licensed.** Free and open source, contributor friendly from day one.

> Status: early construction. See [`docs/build-plan.md`](docs/build-plan.md) for the full
> vision and [`docs/decisions.md`](docs/decisions.md) for what's actually been decided.

## Quick start (headless)

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

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Adding a source adapter or an agent provider is
meant to take a single file — that's a design goal, not an aspiration.

## Licence

[MIT](LICENSE).
