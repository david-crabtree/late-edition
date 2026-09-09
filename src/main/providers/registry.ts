import { fakeProvider } from './fake.js';
import type { AgentProvider, Detection } from './types.js';

/**
 * The set of agent providers the app knows about. The `fake` provider is always
 * present; real providers (claude, codex, gemini, ollama, direct API) register
 * here as they are implemented.
 */
const providers = new Map<string, AgentProvider>();

export function registerProvider(provider: AgentProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): AgentProvider | undefined {
  return providers.get(id);
}

export function listProviders(): AgentProvider[] {
  return [...providers.values()];
}

/** Probe every registered provider. Used by the "staff available" screen / `detect` CLI. */
export async function detectAll(): Promise<Map<string, Detection>> {
  const out = new Map<string, Detection>();
  await Promise.all(
    listProviders().map(async (p) => {
      try {
        out.set(p.id, await p.detect());
      } catch (err) {
        out.set(p.id, {
          installed: false,
          authenticated: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
  return out;
}

// Always-available baseline.
registerProvider(fakeProvider);
