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
| Anthropic | `claude` | `claude -p "<prompt>" --output-format json` | `.result` | `--model <id>` | 📄🔌 |
| OpenAI | `codex` | `codex exec --sandbox read-only --ask-for-approval never --output-last-message <f>` | the file | `-m <id>` | 📄🔌 |
| Google | `gemini` | `gemini -p "<prompt>" --output-format json` | `.response` | `-m <id>` | 📄🔌 |
| OpenCode | `opencode` | `opencode run --quiet "<prompt>"` | stdout | `-m provider/model` | 📄🔌 |
| Local | Ollama | HTTP `POST localhost:11434/api/generate` | `.response` | `model` field | 📄🔌 |
| Direct API | — | OpenAI chat completions / Anthropic Messages | per format | request field | 🔌 |
| xAI | `grok` | VERIFY exists; else use Direct API with a key | — | — | ⏳ |
| GitHub | `copilot` | VERIFY non-interactive mode; degrade gracefully | — | — | ⏳ |

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
