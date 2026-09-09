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
      const { stdout } = await runCli('mytool', ['--json', composePrompt(job)], {
        timeoutMs: job.timeoutMs,
        cwd: job.workingDir,
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
