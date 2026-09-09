# Provider CLI invocation reference

> **VERIFY policy.** Every flag in this file must be checked against the actually installed
> CLI. Late Edition never invents flags: if a provider's CLI has changed, detection should
> fail with a clear message rather than run a bad command. Fill each row in from the real
> `--help` output on a machine that has the tool, and note the version you verified against.

Legend: ✅ verified on this machine · ❓ from docs, unverified · ⛔ not installed here

| Provider | CLI | Non-interactive invocation | JSON output | Model flag | Verified |
|---|---|---|---|---|---|
| Anthropic | `claude` | `claude -p "<prompt>" --output-format json` | `--output-format json` | `--model <id>` | ❓ |
| OpenAI | `codex` | `codex exec "<prompt>"` | check `--json` | check | ❓ |
| Google | `gemini` | `gemini -p "<prompt>"` | check | `-m <id>` | ❓ |
| OpenCode | `opencode` | `opencode run "<prompt>"` | check | check | ❓ |
| xAI | `grok` | VERIFY exists; else direct API | — | — | ❓ |
| GitHub | `copilot` | VERIFY non-interactive mode | — | — | ❓ |
| Local | Ollama | HTTP `POST localhost:11434/api/generate` | native JSON | `model` field | ❓ |
| Direct API | — | HTTPS with user key | native JSON | request field | n/a |

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
