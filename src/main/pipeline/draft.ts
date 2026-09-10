import type { Brief, TokenUsage } from '../core/edition.js';
import type { Signal } from '../core/signal.js';
import type { CopyCheck, EditorCall, FiledReport, PhotoBrief } from './contracts.js';
import type { VerifyDecision } from './verify.js';

/** The pipeline stages, in order. */
export const STAGES = [
  'WIRE',
  'ASSIGN',
  'TRIAGE',
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
  /** The picture desk's brief, when that desk is switched on. */
  photo?: PhotoBrief;
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
  /** The standing assignment this edition belongs to, if any. */
  assignmentId?: string;
  /** Set when the Chief asked for clarification on a vague brief; `answer` resumes the run. */
  clarification?: { questions: string[]; answer?: string };
  /**
   * The mid-run yes/no the Chief is waiting on, and every one already settled. Answered
   * decisions are kept so a story is never asked about twice on a resume, and so the
   * Editor's Log can say plainly which stories ran unchecked.
   */
  verify?: { slug: string; question: string; reason: string };
  verifyDecisions?: VerifyDecision[];
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
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number;
  },
  /**
   * When given, the spend is also announced as it happens. Without this the app could
   * only ever learn the token count once, when the whole edition came back — which is
   * why the counter sat still all run and then jumped to the final figure.
   */
  log?: { emit(stage: string, event: string, detail?: Record<string, unknown>): void },
  model?: string,
): void {
  if (!usage) return;
  draft.tokenUsage.push({
    provider: providerId,
    role,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd: usage.costUsd,
  });
  const spent =
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0);
  log?.emit('usage', 'spent', {
    role,
    provider: providerId,
    model,
    tokens: spent,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd: usage.costUsd,
    total: sumTokens(draft),
    totals: sumUsage(draft),
    totalCostUsd: sumCostUsd(draft),
  });
}

/** Every token counted so far this edition, split by what kind it was. */
export function sumUsage(draft: { tokenUsage: TokenUsage[] }): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
} {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  for (const u of draft.tokenUsage) {
    t.input += u.inputTokens ?? 0;
    t.output += u.outputTokens ?? 0;
    t.cacheRead += u.cacheReadTokens ?? 0;
    t.cacheWrite += u.cacheWriteTokens ?? 0;
  }
  t.total = t.input + t.output + t.cacheRead + t.cacheWrite;
  return t;
}

/** Total tokens recorded so far this edition, cache included (that's what providers count). */
export function sumTokens(draft: EditionDraft): number {
  return sumUsage(draft).total;
}

/** Total provider-reported cost (USD) recorded so far this edition. */
export function sumCostUsd(draft: EditionDraft): number {
  return draft.tokenUsage.reduce((n, u) => n + (u.costUsd ?? 0), 0);
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
