import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';
import { composePrompt } from './util.js';

/**
 * Local models via Ollama's REST API (default http://localhost:11434). Verified
 * (docs/providers-research.md): POST /api/generate with "stream": false returns the
 * final text in `response`; "format": "json" constrains output to JSON; GET
 * /api/tags lists installed models. No CLI or credentials required.
 */
const DEFAULT_HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '') || 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';

export const ollamaProvider: AgentProvider = {
  id: 'ollama',
  displayName: 'Ollama (local models)',
  maturity: 'untested',
  setupSteps: [
    'Install Ollama from https://ollama.com',
    'ollama serve',
    'ollama pull llama3.1   (or any model you prefer)',
  ],
  capabilities: { webSearch: false, fileAccess: false, jsonOutput: true, streaming: true },

  async detect(): Promise<Detection> {
    try {
      const res = await fetch(`${DEFAULT_HOST}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return {
          installed: false,
          authenticated: false,
          detail: `Ollama responded ${res.status}.`,
        };
      }
      const body = (await res.json()) as { models?: { name?: string }[] };
      const models = (body.models ?? []).map((m) => m.name).filter((n): n is string => !!n);
      return {
        installed: true,
        authenticated: true,
        billing: 'free',
        detail:
          models.length > 0
            ? `Models: ${models.join(', ')} — local, no cost.`
            : 'Running, but no models pulled (try `ollama pull llama3.2`).',
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        detail: `No Ollama server at ${DEFAULT_HOST}. Install: https://ollama.com`,
      };
    }
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    const model = job.model ?? DEFAULT_MODEL;
    yield { type: 'start', provider: 'ollama', model };
    try {
      const res = await fetch(`${DEFAULT_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: composePrompt(job),
          stream: false,
          ...(job.outputSchema ? { format: 'json' } : {}),
        }),
        signal: AbortSignal.timeout(job.timeoutMs),
      });
      if (!res.ok) {
        yield { type: 'error', error: `Ollama responded ${res.status}: ${await safeText(res)}` };
        return;
      }
      const body = (await res.json()) as {
        response?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const text = (body.response ?? '').trim();
      if (!text) {
        yield { type: 'error', error: 'Ollama returned an empty response.' };
        return;
      }
      yield { type: 'text', text };
      yield { type: 'usage', inputTokens: body.prompt_eval_count, outputTokens: body.eval_count };
      yield { type: 'done', output: text };
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
    }
  },
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
