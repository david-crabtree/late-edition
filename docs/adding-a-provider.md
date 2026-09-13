# Adding an agent provider

A provider lets the newsroom run a role (reporter, writer, editor, copy desk) on some
agent. Most providers wrap a CLI the user has already authenticated; some talk HTTP.

## 1. Verify the invocation first

**Do not invent flags.** Check the tool's current `--help` / official docs and record what
you found in [`docs/providers-research.md`](providers-research.md), noting the date and your
confidence. If a provider's CLI has changed, detection should fail with a clear message
rather than run a bad command.

## 2. Implement the interface

Create `src/main/providers/<id>.ts` implementing `AgentProvider` from
[`src/main/providers/types.ts`](../src/main/providers/types.ts):

```ts
import { CliNotInstalledError, probe, runCli } from './cli.js';
import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt, jsonField } from './util.js';

export const myProvider: AgentProvider = {
  id: 'mytool',
  displayName: 'My Tool',
  capabilities: { webSearch: false, fileAccess: true, jsonOutput: true, streaming: true },

  async detect(): Promise<Detection> {
    const p = await probe('mytool', ['--version']);
    return p.installed
      ? { installed: true, authenticated: true, version: p.stdout || undefined }
      : { installed: false, authenticated: false, detail: 'Install: https://…' };
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    yield { type: 'start', provider: 'mytool', model: job.model };
    try {
      // The prompt goes on stdin, never argv — see docs/providers.md.
      const { stdout } = await runCli('mytool', ['--json'], {
        timeoutMs: job.timeoutMs,
        cwd: job.workingDir,
        input: composePrompt(job),
      });
      const text = jsonField(stdout, 'result') ?? stdout.trim();
      yield { type: 'text', text };
      yield { type: 'done', output: text };
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

### Rules

- **Never store the user's credentials** when a CLI owns the auth. The CLI is the source of
  truth; we only spawn it.
- **Pass the prompt on stdin** (`runCli`'s `input`), never in argv. It embeds fetched web
  text, and on Windows argv goes through `cmd.exe /c`, which is an injection route and an
  ~8 KB limit. If a CLI truly cannot read stdin, write the prompt to a temp file and pass
  the path — never the raw text.
- **Return the model's final text.** Extract it from whatever envelope the tool emits (a
  JSON `.result` field, a `--output-last-message` file, plain stdout). The pipeline handles
  JSON parsing — a provider must not.
- **A `run` must always end** with a `done` or an `error` event. Turn a missing binary
  (`CliNotInstalledError`) and a timeout into clean `error` events.
- **Isolate file access.** `job.workingDir` is a scratch dir containing only that job's
  materials — never point an agent at the user's home directory.

## 3. Register it

Add to [`src/main/providers/registry.ts`](../src/main/providers/registry.ts):

```ts
registerProvider(myProvider);
```

## 4. Assign it

In a newsroom's `staff.yaml`:

```yaml
reporters:
  default: { provider: mytool, model: some-model }
```

## 5. The `researcher` role (web browsing)

`job.role` can be `researcher` — the tier that gathers sourced findings before reporters
write. Researchers are the one role expected to browse the web. If your CLI has a web/search
tool, branch on `job.role === 'researcher'` in `run()` to enable it (once you've **verified**
the exact flag against the tool's docs — never invent one). Set `capabilities.webSearch`
accordingly: when it's `false`, the RESEARCH stage still runs your provider but warns the user
that findings may come from model memory rather than live sources. Point a newsroom's
`researchers:` desk at your provider in `staff.yaml`, ideally on a cheaper model — research is
the token-hungry tier.
