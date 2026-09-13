import type { AgentEvent, AgentJob, AgentProvider, Detection } from './types.js';

/**
 * Direct-API fallback for any provider without a usable CLI. "Bring your own key":
 * the user supplies an endpoint + key via environment variables. Supports
 * OpenAI-compatible chat completions (default) and the Anthropic Messages API.
 *
 * Env:
 *   LATE_EDITION_API_FORMAT   'openai' (default) | 'anthropic'
 *   LATE_EDITION_API_URL      base URL (defaults per format)
 *   LATE_EDITION_API_KEY      the API key (never stored by us; read from env only)
 *   LATE_EDITION_API_MODEL    fallback model id when the job doesn't set one
 */
type ApiFormat = 'openai' | 'anthropic';

function cfg() {
  const format = (process.env.LATE_EDITION_API_FORMAT as ApiFormat) || 'openai';
  const url =
    process.env.LATE_EDITION_API_URL?.replace(/\/$/, '') ||
    (format === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1');
  return {
    format,
    url,
    key: process.env.LATE_EDITION_API_KEY ?? '',
    model: process.env.LATE_EDITION_API_MODEL,
  };
}

export const directApiProvider: AgentProvider = {
  id: 'directapi',
  displayName: 'Direct API (bring your own key)',
  maturity: 'untested',
  blurb:
    'Any OpenAI- or Anthropic-shaped API, using a key you already hold. The most ' +
    'fiddly route: the key is read from an environment variable, which this app will ' +
    'not set for you and cannot see.',
  manualOnly:
    'This one is all on you, and it is the fiddliest of the lot. The key lives in an ' +
    'environment variable because Late Edition will not hold your key — so there is ' +
    'nothing here for a button to press. If you have not done this before, one of the ' +
    'agents above is a far easier start.',
  setup: [
    {
      text: 'Have an API key from whichever provider you want to use',
      note: 'This route bills per use against that key. Late Edition reads it from your environment at call time, sends it only to the endpoint you configured, and never writes it to disk.',
    },
    {
      text: 'Set LATE_EDITION_API_KEY in your environment, then restart Late Edition',
      note: 'On Windows: search for "Edit the system environment variables". A variable set in a terminal will not reach an app that is already running.',
    },
    {
      text: 'Optionally set LATE_EDITION_API_URL, _MODEL and _FORMAT',
      note: 'Only needed to point at something other than the default endpoint.',
    },
  ],
  capabilities: {
    webSearch: false,
    fileAccess: false,
    jsonOutput: true,
    streaming: false,
    modelSyntax: {
      hint: 'Whatever model id your endpoint expects. Blank falls back to LATE_EDITION_API_MODEL.',
    },
  },

  async detect(): Promise<Detection> {
    const { key, format, url } = cfg();
    if (!key) {
      return {
        installed: false,
        authenticated: false,
        detail: 'Set LATE_EDITION_API_KEY (and optionally _URL/_MODEL/_FORMAT) to enable.',
      };
    }
    return {
      installed: true,
      authenticated: true,
      billing: 'api',
      detail: `${format} @ ${url} — ⚠️ metered API key: every call is real money.`,
    };
  },

  async *run(job: AgentJob): AsyncIterable<AgentEvent> {
    const c = cfg();
    const model = job.model ?? c.model;
    yield { type: 'start', provider: 'directapi', model };
    if (!c.key) {
      yield { type: 'error', error: 'LATE_EDITION_API_KEY is not set.' };
      return;
    }
    if (!model) {
      yield { type: 'error', error: 'No model set (job.model or LATE_EDITION_API_MODEL).' };
      return;
    }
    try {
      const result =
        c.format === 'anthropic'
          ? await callAnthropic(c.url, c.key, model, job)
          : await callOpenAI(c.url, c.key, model, job);
      if (!result.text) {
        yield { type: 'error', error: 'Direct API returned no text.' };
        return;
      }
      yield { type: 'text', text: result.text };
      if (result.usage) yield { type: 'usage', ...result.usage };
      yield { type: 'done', output: result.text };
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
    }
  },
};

interface CallResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

async function callOpenAI(
  url: string,
  key: string,
  model: string,
  job: AgentJob,
): Promise<CallResult> {
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: job.systemPrompt },
        { role: 'user', content: job.userPrompt },
      ],
      ...(job.outputSchema ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(job.timeoutMs),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await safeText(res)}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (body.choices?.[0]?.message?.content ?? '').trim(),
    usage: { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens },
  };
}

async function callAnthropic(
  url: string,
  key: string,
  model: string,
  job: AgentJob,
): Promise<CallResult> {
  const res = await fetch(`${url}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: job.budget?.maxTokens ?? 4096,
      system: job.systemPrompt,
      messages: [{ role: 'user', content: job.userPrompt }],
    }),
    signal: AbortSignal.timeout(job.timeoutMs),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await safeText(res)}`);
  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  return {
    text,
    usage: { inputTokens: body.usage?.input_tokens, outputTokens: body.usage?.output_tokens },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
