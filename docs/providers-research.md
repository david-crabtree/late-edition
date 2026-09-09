# AI Coding-Agent CLI: Non-Interactive Invocation Research

Research for a Node app that shells out to each CLI and parses structured output.
Facts are cited to official docs / GitHub. Anything not confirmable from an
official source is marked **UNVERIFIED**. Do not invent flags beyond what is
listed here.

Last researched: 2026-09-09.

---

## 1. Claude Code (`claude`)

**Confidence: HIGH** — all facts below are from official Anthropic docs.

### One-shot command
```bash
claude -p "explain this function"
# piping stdin also works:
cat logs.txt | claude -p "analyze these logs"
```
- `-p` / `--print`: run a single query non-interactively, print result, exit.
- Exit code 0 on success, non-zero on failure. On an in-run failure (e.g. missing
  auth) it prints the failure as the result on stdout.

### JSON / structured output
```bash
claude -p "Summarize this project" --output-format json
```
- `--output-format` accepts `text` (default), `json`, or `stream-json`.
- **The final answer text is in the `result` field** of the JSON object
  (confirmed: "with the text result in the `result` field"). The JSON also
  carries `session_id`, `total_cost_usd` (plus a per-model cost breakdown), and
  request metadata.
- Extract with jq: `claude -p "..." --output-format json | jq -r '.result'`
- `--json-schema '<schema>'` (with `--output-format json`) returns schema-conforming
  data in a **`structured_output`** field (separate from `result`).
- `stream-json`: newline-delimited JSON events; requires `--verbose` and (for token
  deltas) `--include-partial-messages`. The **last line is a `result` message**
  with final text, cost, and session metadata.

### Model selection
```bash
claude -p "..." --model opus
```
- `--model` takes an alias (`sonnet`, `opus`, `haiku`, `fable`) or a full model name.

### Version / auth check
- Auth status: `claude auth status` (JSON) or `claude auth status --text`. Exit code
  0 if logged in, 1 if not. Login: `claude auth login`.
- `--version`: **UNVERIFIED** — not listed in the cited CLI reference, though it is
  conventionally available. Prefer `claude auth status` as the scriptable liveness/auth check.
- Note for CI/scripting: `--bare` skips auto-discovery (hooks, skills, MCP, CLAUDE.md)
  for reproducible runs; in bare mode auth uses `ANTHROPIC_API_KEY`, not the subscription login.

### Sources
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk

---

## 2. OpenAI Codex CLI (`codex`)

**Confidence: HIGH** on subcommand and flag names; **MEDIUM** on exact JSON event
schema (docs describe it as newline-delimited JSON events but do not fully enumerate
each event's fields).

### One-shot command
```bash
codex exec "Run lint and tests. Report each failure and its likely cause."
```
- `codex exec` is the non-interactive / scripting / CI subcommand.
- Config defaults come from `~/.codex/config.toml`; override any single value with
  `-c key=value` for one invocation.

### JSON / structured output
```bash
codex exec --json "your prompt"
# capture final natural-language message to a file (good with --json in CI):
codex exec --json --output-last-message out.md "your prompt"
```
- `--json`: emit **newline-delimited JSON events** instead of formatted text.
- `--output-last-message FILE`: write the assistant's final message to `FILE`
  (this is the cleanest way to get the final text as a plain string).
- There is no single `.result` envelope like Claude Code; parse the JSONL stream,
  or use `--output-last-message` for the final answer. Exact per-event field
  shape: **UNVERIFIED** (not fully enumerated in official docs — verify with
  `codex exec --json --help` / a live run).

### Model selection
```bash
codex exec -m <model> "..."      # or --model, or -c model=<model>
```

### Sandbox / approval flags to run without prompts
```bash
codex exec --sandbox workspace-write "..."     # -s: read-only | workspace-write | danger-full-access
codex exec -a never "..."                       # --ask-for-approval: untrusted | on-request | never
# fully bypass (dangerous; only in an already-hardened/isolated env):
codex exec --dangerously-bypass-approvals-and-sandbox "..."
```
- `-s` / `--sandbox`: sandbox policy (`read-only`, `workspace-write`, `danger-full-access`).
- `-a` / `--ask-for-approval`: `untrusted`, `on-request`, or `never`. Use `never` for unattended runs.
- `--dangerously-bypass-approvals-and-sandbox`: bypass all protections.
- `--full-auto`: mentioned in Codex docs as a convenience for unattended local work.
  Its exact semantics vs. the `-s`/`-a` combination are **UNVERIFIED** — prefer the
  explicit `--sandbox` + `--ask-for-approval never` pair, which is documented.

### Version / auth check
- Auth: `codex login status` — exits 0 when logged in (usable as a scriptable check).
- `codex --version`: **UNVERIFIED** — conventional but not explicitly cited; verify on the target machine.

### Sources
- https://learn.chatgpt.com/docs/codex/cli
- https://learn.chatgpt.com/docs/developer-commands?surface=cli (Developer commands reference)
- https://developers.openai.com/codex/noninteractive

---

## 3. Gemini CLI (`gemini`)

**Confidence: HIGH** — from the official Gemini CLI headless docs.

### One-shot command
```bash
gemini -p "Explain the architecture of this codebase"
```
- `-p` / `--prompt`: run a single query non-interactively. Headless mode also
  activates automatically in non-TTY environments.

### JSON / structured output
```bash
gemini -p "Your question" --output-format json
```
- `--output-format` accepts `json` and `stream-json` (default is plain text).
- JSON output is a **single object with three fields**:
  - **`response`** (string): the model's answer — this holds the final text.
  - `stats` (object): token usage / API latency (per-model `models`, `tools`).
  - `error` (optional): failure details.
- `stream-json`: newline-delimited events (session metadata, message chunks, tool
  interactions, final result).
- Exit codes: `0` success, `1` general/API error, `42` input validation error,
  `53` turn limit exceeded.

### Model selection
```bash
gemini -p "..." -m gemini-2.5-flash      # -m / --model
```

### Version / auth check
- `gemini --version`: **UNVERIFIED** — conventional, not explicitly cited. Verify on target.
- Auth is via API key env (e.g. `GEMINI_API_KEY`) or interactive login; no dedicated
  scriptable "auth status" subcommand was found — **UNVERIFIED**.

### Sources
- https://geminicli.com/docs/cli/headless/
- https://google-gemini.github.io/gemini-cli/docs/cli/headless.html
- https://github.com/google-gemini/gemini-cli

---

## 4. OpenCode (`opencode`)

**Confidence: MEDIUM-HIGH** — `opencode run`, `-m`, and `--format json` are
confirmed from official CLI docs; the exact JSON event schema is not fully documented.

### One-shot command
```bash
opencode run "Explain the use of context in Go"
```
- `opencode run` is the non-interactive command; the prompt is passed as arguments
  and the answer streams to stdout.

### JSON / structured output
```bash
opencode run --format json "summarize the last commit"
```
- `--format` accepts `default` (formatted) or `json` (**raw JSON events**).
- Output is a stream of raw event objects, **not** a single `.result` envelope —
  the app must parse the event stream to assemble the final text. Exact event field
  names: **UNVERIFIED** (verify with `opencode run --help` / a live run).
- `-q` / `--quiet` suppresses the spinner (useful when piping).

### Model selection
```bash
opencode run -m anthropic/claude-3-5-sonnet "..."     # -m / --model, format: provider/model
```

### Version / auth check
- `opencode --version` (or `-v`).
- Scriptable auth-status check: **UNVERIFIED** (auth is managed via `opencode auth`;
  no confirmed non-interactive status subcommand).

### Sources
- https://opencode.ai/docs/cli/

---

## 5. Ollama REST API (http://localhost:11434)

**Confidence: HIGH** — from the official Ollama API docs. This is a local HTTP API,
not a CLI; the Node app should POST JSON directly.

### POST /api/generate (single prompt)
Non-streaming (recommended for scripting — set `"stream": false`):
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```
Response (non-streaming):
```json
{
  "model": "llama3.2",
  "created_at": "...",
  "response": "The sky is blue because...",
  "done": true,
  "total_duration": 5043500667
}
```
- **Final text is in `response`.** With `"stream": true` (the default), the endpoint
  returns a sequence of JSON objects each with a partial `response` chunk; the final
  object has `"done": true`, an empty `response`, and timing/`context` fields.

### POST /api/chat (messages)
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [{"role": "user", "content": "why is the sky blue?"}],
  "stream": false
}'
```
Response (non-streaming):
```json
{
  "model": "llama3.2",
  "message": { "role": "assistant", "content": "Hello! ..." },
  "done": true
}
```
- **Final text is in `message.content`.** Streaming (default) returns per-chunk
  objects whose `message.content` holds each delta, ending with `"done": true`.

### JSON mode (`format`)
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "...respond in JSON...",
  "format": "json",
  "stream": false
}'
```
- `"format": "json"` constrains the model output (the `response` / `message.content`
  value) to valid JSON. Docs note: you must still instruct the model to use JSON in
  the prompt. (`format` also accepts a JSON Schema object for structured outputs;
  schema-object support is present in current Ollama but treat exact schema behavior
  as **verify-on-target** if you rely on it.)

### GET /api/tags (list installed models)
```bash
curl http://localhost:11434/api/tags
```
- Returns `{ "models": [ { "name", "size", "digest", "details": {...} }, ... ] }`.
- Good liveness + "is the model pulled?" check for the app.

### Sources
- https://github.com/ollama/ollama/blob/main/docs/api.md

---

## Quick reference matrix

| Tool | One-shot | JSON flag | Final-text location | Model flag | Version/auth check |
|------|----------|-----------|---------------------|------------|--------------------|
| Claude Code | `claude -p "…"` | `--output-format json` | `.result` (or `.structured_output` w/ schema) | `--model` | `claude auth status` |
| Codex | `codex exec "…"` | `--json` (+ `--output-last-message FILE`) | JSONL events / last-message file | `-m`/`--model` | `codex login status` |
| Gemini | `gemini -p "…"` | `--output-format json` | `.response` | `-m`/`--model` | `gemini --version` (UNVERIFIED) |
| OpenCode | `opencode run "…"` | `--format json` | raw JSON event stream (parse) | `-m provider/model` | `opencode --version` |
| Ollama | `POST /api/generate` | body `"format":"json"` | `.response` (generate) / `.message.content` (chat) | body `"model"` | `GET /api/tags` |

## Items flagged UNVERIFIED (do not assume in code)
- `claude --version` flag (use `claude auth status` instead).
- Codex `--full-auto` exact semantics; `codex --version` flag.
- Codex `--json` per-event field schema.
- Gemini `--version` flag and any non-interactive auth-status subcommand.
- OpenCode `--format json` event field names; non-interactive auth-status subcommand.
- Ollama `format` as a JSON-Schema object (basic `"json"` string mode is confirmed).
