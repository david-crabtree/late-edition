import type { FiledReport, Placement } from '../pipeline/contracts.js';

/** A resolved reference from the paper back to the raw signal that supports it. */
export interface SourceRef {
  signalId: string;
  title: string;
  url?: string;
}

/** One finished story in an edition. */
export interface Story {
  slug: string;
  beatId: string;
  beatName: string;
  headline: string;
  standfirst: string;
  /** Final copy in Markdown, as approved by the copy desk. */
  body: string;
  byline: string;
  placement: Placement;
  /** The angle the editor chose, and why (Editor's Log fodder). */
  chosenAngle: string;
  rationale: string;
  /** Present when reporters disagreed and the story runs as Competing Takes. */
  competingTakes?: { reporter: string; angle: string }[];
  /** A corroborated, urgent finding that stopped the press — runs page one with a kicker. */
  stopThePress?: boolean;
  /** Related past coverage from the morgue (archive). */
  morgue?: { editionId: string; headline: string; date: string }[];
  sources: SourceRef[];
  /** Every filed report, kept for transparency and the morgue. */
  reports: FiledReport[];
}

/** A one-line item not worth a full story. */
export interface Brief {
  text: string;
  signalId?: string;
  url?: string;
}

/** Something the copy desk cut or changed, surfaced honestly. */
export interface Correction {
  claim: string;
  reason: string;
  reporter?: string;
}

/** Per-role, per-provider token (and cost) accounting for one edition. */
export interface TokenUsage {
  provider: string;
  role: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Provider-reported cost of the call in USD, when available. */
  costUsd?: number;
}

/** One complete paper. Serialized to `edition.json`. */
export interface Edition {
  /** e.g. "2026-09-09-001". */
  id: string;
  /** Sequential edition number across the newsroom's life. */
  number: number;
  /** ISO date (YYYY-MM-DD) the edition covers. */
  date: string;
  paperName: string;
  tagline?: string;
  /** The editor's one-line read on the day's mood. */
  weatherLine?: string;
  /** True for a between-editions bulletin fired by a tripwire, not the daily cycle. */
  lateExtra?: boolean;
  /** The standing assignment this edition was produced for, if any. */
  assignmentId?: string;
  stories: Story[];
  briefs: Brief[];
  /** The managing editor's notes on judgement calls. */
  editorsLog: string[];
  corrections: Correction[];
  tokenUsage: TokenUsage[];
  generatedAt: string;
}
