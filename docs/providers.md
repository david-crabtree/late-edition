# Provider CLI invocation reference

> **VERIFY policy.** Late Edition never invents flags: if a provider's CLI has changed,
> detection should fail with a clear message rather than run a bad command. The syntax below
> was verified against official docs on 2026-09-09 — full citations and confidence levels are
> in [`providers-research.md`](providers-research.md). The invocations are implemented in
> [`src/main/providers/`](../src/main/providers/); re-verify against the installed tool when a
> CLI updates.

Legend: 📄 verified from official docs · 🔌 implemented · ⏳ not yet shipped

| Provider | CLI | Implemented invocation | Final text | Model flag | Status |
|---|---|---|---|---|---|
| Anthropic | `claude` | `<prompt on stdin> \| claude -p --output-format json` | `.result` | `--model <id>` | 📄🔌 |
| OpenAI | `codex` | `<prompt on stdin> \| codex exec --sandbox read-only --ask-for-approval never --output-last-message <f> -` | the file | `-m <id>` | 📄🔌 |
| Google | `gemini` | `<prompt on stdin> \| gemini --output-format json` | `.response` | `-m <id>` | 📄🔌 |
| OpenCode | `opencode` | `<prompt on stdin> \| opencode run --quiet` | stdout | `-m provider/model` | 📄🔌 |
| Local | Ollama | HTTP `POST localhost:11434/api/generate` | `.response` | `model` field | 📄🔌 |
| Direct API | — | OpenAI chat completions / Anthropic Messages | per format | request field | 🔌 |
| xAI | `grok` | VERIFY exists; else use Direct API with a key | — | — | ⏳ |
| GitHub | `copilot` | VERIFY non-interactive mode; degrade gracefully | — | — | ⏳ |

## The prompt always goes on stdin

Every CLI provider passes the composed prompt via `runCli`'s `input` (stdin), never argv.
The prompt embeds fetched web and RSS text; on Windows `runCli` launches through
`cmd.exe /c`, which mangles quotes, expands `%VAR%` and caps the command line at ~8 KB —
so a prompt in argv is both an injection route and a truncation bug. What was checked
(2026-09-13):

- **Claude Code**: `cat file | claude -p "..."` is in the headless docs.
- **Codex**: `codex exec -` — the `-` sentinel and "if you omit the prompt argument, Codex
  reads the prompt from stdin" are in the non-interactive docs; the clap definition in
  `codex-rs/exec/src/cli.rs` says the same.
- **Gemini**: the CLI reference lists `cat logs.txt | gemini`; headless mode triggers in a
  non-TTY environment; `gemini.tsx` reads stdin when `!process.stdin.isTTY`. `-p` is
  documented as "Appended to stdin input if provided" and is not passed.
- **OpenCode**: the docs page is silent; `packages/opencode/src/cli/cmd/run.ts` reads stdin
  when `!process.stdin.isTTY` and uses it as the message when no positional is given.

## Detection

On launch and on demand, Late Edition probes each provider:

1. Is the CLI on `PATH`? (`which`/`where`, or a `--version` probe)
2. Is it authenticated? (a cheap no-op or a documented status command)
3. What can it do? (`capabilities`: web search, file access, JSON output, streaming)

Results feed the "staff available" screen. Missing providers show install instructions and
nothing more. The `fake` provider is always available and requires nothing.

## Notes per provider

_(Record real `--help` findings, quirks, exit codes and auth flows here as they are
verified during Milestone 1.)_
