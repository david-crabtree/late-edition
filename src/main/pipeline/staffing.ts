/**
 * A desk with nobody on it.
 *
 * Every desk used to fall back to the offline stand-in, which meant a user who never opened
 * Setup got a complete, confident, entirely invented newspaper with nothing to tell them so.
 * An unstaffed desk now stops the edition instead, and the app turns this into the Chief
 * telling you which desk is empty.
 */
export class StaffNotConfiguredError extends Error {
  readonly role: string;
  readonly deskLabel: string;
  constructor(role: string, deskLabel: string) {
    super(
      `No agent is set for the ${deskLabel}. Open Setup and choose one, or sign in to an agent CLI and pick it there.`,
    );
    this.name = 'StaffNotConfiguredError';
    this.role = role;
    this.deskLabel = deskLabel;
  }
}

/** Provider ids that mean "nobody has chosen an agent for this desk yet". */
const UNSET = new Set(['', 'unset', 'none', 'todo']);

export function isUnstaffed(providerId: string | undefined): boolean {
  return !providerId || UNSET.has(providerId.trim().toLowerCase());
}
