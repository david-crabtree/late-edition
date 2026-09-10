import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './paths.js';

/**
 * The emergency stop. A newsroom is "halted" when a sentinel file exists at its root; the
 * pipeline checks for it between stages and before each agent call and stops launching work,
 * leaving the edition idle and resumable. This is the panic button for a tool that can spawn
 * many CLI calls: `late-edition halt` drops the file, `late-edition halt --clear` removes it.
 */
export function haltFile(root: string): string {
  return join(paths(root).root, 'HALT');
}

/** Is this newsroom currently halted? */
export function isHalted(root: string): boolean {
  return existsSync(haltFile(root));
}

/** Raise the stop: no new agent calls will start until it's cleared. */
export function setHalt(root: string, reason?: string): void {
  const p = paths(root);
  mkdirSync(p.root, { recursive: true });
  writeFileSync(
    haltFile(root),
    `${new Date().toISOString()} — newsroom halted${reason ? `: ${reason}` : ''}.\nDelete this file (or run \`late-edition halt --clear\`) to allow runs again.\n`,
    'utf8',
  );
}

/** Clear the stop. */
export function clearHalt(root: string): void {
  rmSync(haltFile(root), { force: true });
}

/** Thrown when a run is stopped by the halt switch. Caught by the pipeline as a clean idle. */
export class PipelineHaltError extends Error {
  constructor(readonly editionId?: string) {
    super('Halted: the newsroom stop switch is set — no new agent calls will start.');
    this.name = 'PipelineHaltError';
  }
}

/** Throw {@link PipelineHaltError} if the newsroom has been halted. */
export function assertNotHalted(root: string): void {
  if (isHalted(root)) throw new PipelineHaltError();
}
