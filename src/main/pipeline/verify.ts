import type { StoryDraft } from './draft.js';

/**
 * The Chief putting a mid-run decision to you.
 *
 * A reporter who doesn't trust what they've got used to file anyway. The agent walked over
 * to the office on screen, a question mark appeared, and the run carried on regardless —
 * theatre, not a decision. This makes it real: the run stops, persists, and waits.
 *
 * It rides the same rails as a vague-brief clarification (persist the draft, resume with an
 * answer), with one difference that matters: the answer is yes or no, and NO IS THE DEFAULT.
 * An unattended run must never sit blocked forever waiting for someone who has walked away.
 */
export class VerificationNeededError extends Error {
  constructor(
    readonly editionId: string,
    /** The story the doubt is about. */
    readonly slug: string,
    /** What the Chief is asking, in plain words. */
    readonly question: string,
    /** Why the desk is unsure — the evidence behind the ask. */
    readonly reason: string,
  ) {
    super(question);
    this.name = 'VerificationNeededError';
  }
}

/** How thin is too thin. Below either line the reporter would rather check than file. */
export const THIN_SOURCES = 2;
export const LOW_CONFIDENCE = 0.55;

export interface Doubt {
  slug: string;
  question: string;
  reason: string;
}

/**
 * Should the desk stop and ask before this story goes any further?
 *
 * Two triggers, both from what the reporting actually says about itself: too few sources to
 * corroborate anything, or a reporter who filed with low confidence. Deliberately not a
 * model call — the reporter has already told us, and asking a model whether to ask the user
 * would just spend tokens to reach the same answer.
 */
export function findDoubt(story: StoryDraft): Doubt | null {
  const sources = story.signals.length;
  const confidences = story.reports.map((r) => r.confidence).filter((c) => typeof c === 'number');
  const lowest = confidences.length ? Math.min(...confidences) : 1;

  if (sources < THIN_SOURCES) {
    return {
      slug: story.slug,
      question: `Only ${sources} source${sources === 1 ? '' : 's'} on "${story.beatName}". Send the researcher back for more?`,
      reason: `Nothing here is corroborated — a single source can't check itself. Digging again costs another research pass.`,
    };
  }
  if (lowest < LOW_CONFIDENCE) {
    const pct = Math.round(lowest * 100);
    return {
      slug: story.slug,
      question: `The desk is only ${pct}% sure of "${story.beatName}". Have it verified before we run it?`,
      reason: `A reporter filed at ${pct}% confidence across ${sources} sources. Verifying costs another research pass.`,
    };
  }
  return null;
}

/** The record of what was decided, so the paper can be honest about it either way. */
export interface VerifyDecision {
  slug: string;
  question: string;
  /** True when the user sent the desk back to check. */
  verified: boolean;
  /** True when nobody answered and the run carried on by itself. */
  byDefault?: boolean;
  /** True once the extra dig has actually been done, so a resume doesn't repeat it. */
  done?: boolean;
}

/** The line that goes in the Editor's Log when a story ran without being checked. */
export function unverifiedNote(d: VerifyDecision): string {
  return d.byDefault
    ? `"${d.question}" — nobody was at the desk, so it ran unverified.`
    : `"${d.question}" — you said run it. It ran unverified.`;
}
