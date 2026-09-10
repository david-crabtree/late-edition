import type { Brief, TokenUsage } from '../core/edition.js';
import type { Signal } from '../core/signal.js';
import type { CopyCheck, EditorCall, FiledReport } from './contracts.js';

/** The pipeline stages, in order. */
export const STAGES = [
  'WIRE',
  'ASSIGN',
  'RESEARCH',
  'REPORT',
  'ANGLES',
  'CALL',
  'WRITE',
  'CHECK',
  'PROOF',
  'PRESS',
  'DONE',
] as const;
export type Stage = (typeof STAGES)[number];

export function nextStage(stage: Stage): Stage {
  const i = STAGES.indexOf(stage);
  return STAGES[Math.min(i + 1, STAGES.length - 1)] as Stage;
}

/** A story as it moves through the pipeline, accreting data at each stage. */
export interface StoryDraft {
  slug: string;
  beatId: string;
  beatName: string;
  signals: Signal[];
  reporterName: string;
  reporterProviderId: string;
  writerProviderId?: string;
  reports: FiledReport[];
  call?: EditorCall;
  copy?: string;
  check?: CopyCheck;
  /** Set at CHECK when an urgent, corroborated finding stops the press. */
  stopThePress?: boolean;
  /** Related past coverage from the morgue, linked at CHECK. */
  morgue?: { editionId: string; headline: string; date: string }[];
}

/** The whole edition in flight. Persisted to `pipeline.json` after every stage. */
export interface EditionDraft {
  id: string;
  number: number;
  date: string;
  paperName: string;
  tagline?: string;
  stage: Stage;
  stories: StoryDraft[];
  briefs: Brief[];
  /** True for a tripwire-fired Late Extra bulletin. */
  lateExtra?: boolean;
  weatherLine?: string;
  editorsLog: string[];
  tokenUsage: TokenUsage[];
  /** Non-fatal problems (source errors, spiked stories) surfaced to the user. */
  warnings: string[];
}

/** Render signals into the numbered, id-tagged block agents cite from. */
export function formatSignals(signals: Signal[]): string {
  if (signals.length === 0) return '(no signals)';
  return signals
    .map((s, i) => {
      const parts = [
        `#${i + 1} [${s.id}] ${s.title}`,
        s.url ? `url: ${s.url}` : undefined,
        `time: ${s.timestamp}`,
        s.body ? `body: ${s.body}` : undefined,
      ].filter(Boolean);
      return parts.join('\n');
    })
    .join('\n\n');
}

/** Record token usage for a role/provider onto the draft. */
export function recordUsage(
  draft: EditionDraft,
  providerId: string,
  role: string,
  usage?: { inputTokens?: number; outputTokens?: number },
): void {
  if (!usage) return;
  draft.tokenUsage.push({
    provider: providerId,
    role,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

/** Total tokens (input + output) recorded so far this edition. */
export function sumTokens(draft: EditionDraft): number {
  return draft.tokenUsage.reduce((n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);
}

/** A URL/file-safe slug for a beat/story. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'story'
  );
}
