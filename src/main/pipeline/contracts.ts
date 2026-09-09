/**
 * Canonical JSON shapes exchanged between the pipeline and the agents.
 * The fake provider emits exactly these; real-provider output is parsed into them.
 * Keeping them in one place means the test double and the live path never drift.
 */

/** A single filed report from one reporter on one story. */
export interface FiledReport {
  /** Persona name or provider label of the reporter. */
  reporter: string;
  /** One-paragraph plain summary of what was found. */
  summary: string;
  /** Every factual claim, each tied to the signal id that supports it. */
  facts: { claim: string; signalId: string }[];
  /** The angle this reporter proposes for the story. */
  proposedAngle: string;
  /** Reporter's confidence in the story, 0..1. */
  confidence: number;
  /** How urgent/breaking this is, 0..1. Feeds stop-the-press later. */
  urgency: number;
  /** Optional free notes for the editor. */
  notes?: string;
}

export type Placement = 'page_one' | 'below_fold' | 'brief' | 'spike';

/** The managing editor's decision for a story after reading all reports. */
export interface EditorCall {
  headline: string;
  standfirst: string;
  /** Description of the angle the editor chose (or how they merged angles). */
  chosenAngle: string;
  placement: Placement;
  /** True when reporters disagreed enough to run "Competing Takes". */
  competingTakes: boolean;
  /** Why this call was made — goes into the Editor's Log. */
  rationale: string;
}

/** Copy desk verification of finished copy against the filed reports. */
export interface CopyCheck {
  /** Whether every claim in the copy is supported by a cited signal. */
  pass: boolean;
  verifiedClaims: { claim: string; signalId: string; supported: boolean }[];
  /** Claims that were cut or flagged, with the reason (goes to Corrections). */
  corrections: { claim: string; reason: string }[];
  /** Anything that looked like injected instructions or out-of-source links. */
  injectionFlags: string[];
}
