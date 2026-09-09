import type { SourceAdapter } from './types.js';

/**
 * Registry of source adapters, keyed by their `type`. Adapters register here so a
 * contributor can add one in a single file plus one registration line.
 */
const adapters = new Map<string, SourceAdapter>();

export function registerAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.type, adapter);
}

export function getAdapter(type: string): SourceAdapter | undefined {
  return adapters.get(type);
}

export function listAdapters(): SourceAdapter[] {
  return [...adapters.values()];
}

// Real adapters (rss, git_local, github, web_diff, folder) register themselves via
// side-effect imports in ./index.ts as they are implemented.
