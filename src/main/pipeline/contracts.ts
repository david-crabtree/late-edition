/**
 * Canonical JSON shapes exchanged between the pipeline and the agents.
 * The fake provider emits exactly these; real-provider output is parsed into them.
 * Keeping them in one place means the test double and the live path never drift.
 */

/**
 * One sourced item a researcher dug up on a story's topic. Each finding becomes a
 * {@link Signal} the reporters can cite — so a URL a researcher never actually found
 * cannot end up in the paper (the copy desk verifies every citation resolves).
 */
export interface ResearchFinding {
  /** Short headline for the item found. */
  title: string;
  /** One- or two-sentence summary of what the source says, in plain text. */
  summary: string;
  /** The source URL. Findings without a usable URL are dropped as unverifiable. */
  url?: string;
  /** Best-effort publication date (ISO-8601), if the source gave one. */
  published?: string;
  /** How relevant to the brief the researcher judges this, 0..1. */
  relevance?: number;
}

/** What a researcher files after a pass: the sourced findings plus a coverage note. */
export interface ResearchDossier {
  findings: ResearchFinding[];
  /** What was and wasn't found — gaps, dead ends, what a second pass should chase. */
  notes?: string;
}

/** The Chief's read on whether a brief is clear enough to run, before spending on research. */
export interface TriageResult {
  /** True if the brief is actionable as-is; false means the desk needs answers first. */
  clear: boolean;
  /** 1-3 crisp questions for the user when `clear` is false. */
  questions?: string[];
  /** Optionally, a tightened restatement of the brief the desk will run with. */
  refinedBrief?: string;
}

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
