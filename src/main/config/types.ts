import type { SourceConfig } from '../adapters/types.js';

/** One configured distribution channel. `type` selects the channel; the rest are its options. */
export interface DistChannelConfig {
  type: string;
  [key: string]: unknown;
}

/** How an approved edition goes out to the team (`config.yaml` `distribution`). */
export interface DistributionConfig {
  /** When true, weekday editions may send without a per-edition confirmation. */
  autoSend: boolean;
  channels: DistChannelConfig[];
}

/** Top-level newsroom configuration (`newsroom/config.yaml`). */
export interface PaperConfig {
  paper: {
    name: string;
    tagline?: string;
    /** IANA timezone, or 'local'. Used for edition dates. */
    timezone?: string;
  };
  schedule?: {
    /** "HH:MM" 24h local time for the daily edition. Scheduling lands later. */
    dailyAt?: string;
  };
  edition?: {
    /** Max lead stories on page one. */
    maxPageOne?: number;
    /** Default urgency (0-1) at which a corroborated story stops the press. */
    urgencyThreshold?: number;
    /** Hard cap on total tokens for one edition; work is curtailed once it's hit. */
    tokenCap?: number;
  };
  distribution?: DistributionConfig;
}

/** How a role maps to a provider (`newsroom/staff.yaml`). */
export interface RoleAssignment {
  provider: string;
  /** Model id, or the sentinel 'best_available'. */
  model?: string;
}

export interface StaffConfig {
  managingEditor: RoleAssignment;
  /**
   * The desk(s) that gather sourced intel before the reporters write. Falls back to the
   * reporter assignment when unset. Point this at a web-capable agent (e.g. claude) —
   * ideally a cheaper model, since research is the token-hungry tier.
   */
  researchers: {
    /** Fallback for beats without a specific researcher assignment. */
    default: RoleAssignment;
    /** Per-beat overrides, keyed by beat id. */
    [beatId: string]: RoleAssignment;
  };
  reporters: {
    /** Fallback for beats without a specific reporter assignment. */
    default: RoleAssignment;
    /** Per-beat overrides, keyed by beat id. */
    [beatId: string]: RoleAssignment;
  };
  writers: {
    default: RoleAssignment;
    [beatId: string]: RoleAssignment;
  };
  copyDesk: RoleAssignment;
  /**
   * The picture desk: shot list, caption and alt text. Falls back to the writers when
   * unset, which is what it did before it had a desk — and meant it paid the writers'
   * model to write captions. It wants the cheap one.
   */
  photoDesk?: RoleAssignment;
}

/** A beat definition (`newsroom/beats/<id>.yaml`). */
export interface BeatConfig {
  id: string;
  name: string;
  /** Persona name for the assigned reporter, if any. */
  reporter?: string;
  /** How many independent angles to commission per story. Default 1. */
  angles?: number;
  /**
   * How many researcher passes to run before the reporters, gathering sourced findings.
   * 0 (the default for source-backed beats) skips research and reports straight from the
   * wire. A free-text `--brief` topic defaults to 1 pass, since a bare topic needs digging.
   */
  research?: number;
  /** Cap on findings kept per story from research, to bound downstream tokens. Default 6. */
  maxFindings?: number;
  /** Prefer different providers across angles for the same story. */
  mixProviders?: boolean;
  /** Per-beat override of the stop-the-press urgency threshold (0-1). */
  urgencyThreshold?: number;
  /** Between-edition tripwires that fire a Late Extra when matched. */
  tripwires?: TripwireConfig[];
  sources: SourceConfig[];
}

/** A between-edition tripwire: when a matching signal appears, dispatch a Late Extra. */
export interface TripwireConfig {
  /** Keyword (case-insensitive substring) or, with `regex: true`, a regular expression. */
  match: string;
  regex?: boolean;
  /** Restrict matching to these source ids (default: all sources on the beat). */
  sources?: string[];
  /** Short label for the bulletin. */
  label?: string;
}

/**
 * A standing assignment: an ongoing topic the newsroom works on a cadence, building on its
 * own past coverage each run. This is the autonomous unit — a reporter can hold several.
 * (`newsroom/assignments/<id>.yaml`.)
 */
export interface Assignment {
  id: string;
  /** Short human label for the assignment. */
  title: string;
  /** The standing brief the desk works each run (e.g. "competitor launches this week"). */
  brief: string;
  /**
   * How often it may run automatically: `manual` (default — only via `assignment run`), or a
   * duration like `30m`, `6h`, `1d`, `1w`. `assignment tick` runs the ones whose cadence is due.
   */
  cadence: string;
  /** Researcher passes per run (overrides the brief default of 1). */
  research?: number;
  /** Cap on findings kept per run. */
  maxFindings?: number;
  /** Force one provider for this assignment's runs (else the newsroom's staff config). */
  provider?: string;
}

/** A fully-loaded newsroom, resolved from disk. */
export interface Newsroom {
  /** Absolute path to the newsroom root (the dir containing config.yaml). */
  root: string;
  config: PaperConfig;
  staff: StaffConfig;
  beats: BeatConfig[];
  /** Standing assignments worked on a cadence (`assignments/*.yaml`). */
  assignments: Assignment[];
  /** House style text (`style.md`). */
  style: string;
  /** Persona texts keyed by persona name, from `staff/*.md`. */
  personas: Map<string, string>;
}
