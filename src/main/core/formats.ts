/**
 * What shape the copy comes out in.
 *
 * The newsroom always wrote one thing: a 1940s wire story. That's the house voice and the
 * default, but the same reporting is worth having as a LinkedIn post, a Reddit write-up or
 * a newsletter blurb — and those are genuinely different pieces of writing, not the same
 * text at different lengths.
 *
 * Two rules survive every format, because they are what make the output worth anything:
 * the citation contract (only literal signal ids resolve) and "no invented facts". A
 * format may change the voice and the furniture. It may never loosen either of those.
 */

export type OutputFormat = 'newspaper' | 'linkedin' | 'reddit' | 'newsletter' | 'brief';

export interface FormatSpec {
  id: OutputFormat;
  /** What the user sees in the picker. */
  label: string;
  /** One line under the label, so the choice is obvious without trying it. */
  hint: string;
  /** Dropped into the writer prompt. Voice and furniture only — never the facts. */
  directive: string;
  /** Roughly how long, before the length control scales it. */
  shape: string;
}

export const FORMATS: FormatSpec[] = [
  {
    id: 'newspaper',
    label: 'Newspaper story',
    hint: 'The house voice — a wire story in the paper’s own style.',
    shape: 'four to six tight paragraphs when well sourced, fewer when thin',
    directive:
      'Write it as a newspaper story in the house style above. Lead with the strongest fact, ' +
      'not a wind-up. No headline (the desk sets that), no sign-off, no bullet points.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn post',
    hint: 'Plain professional English, first person, no hashtag soup.',
    shape: '150 to 250 words in short paragraphs of one or two sentences',
    directive:
      'Write it as a LinkedIn post in plain modern professional English, first person. Open ' +
      'with the single most interesting fact in one line — never "I am thrilled to share" or ' +
      'any variant of it. Short paragraphs, a line of white space between them. End with one ' +
      'genuine question or a plain statement of what it means. No hashtags, no emoji, no ' +
      'engagement bait, no "thoughts?" filler. Do not pretend to personal experience you were ' +
      'not given.',
  },
  {
    id: 'reddit',
    label: 'Reddit post',
    hint: 'Conversational, upfront about what is known and what is not.',
    shape: '200 to 400 words, sub-headed if it helps',
    directive:
      'Write it as a Reddit text post: conversational, direct, no marketing register. Open ' +
      'with the substance. Be explicit about what is well sourced and what is thin — that ' +
      'candour is the point on Reddit, and overclaiming gets torn apart. Short paragraphs, ' +
      'bold sub-heads only if the post genuinely has sections. No hashtags, no emoji.',
  },
  {
    id: 'newsletter',
    label: 'Newsletter / RSS blurb',
    hint: 'A tight summary someone can scan in a feed.',
    shape: '80 to 150 words in one or two paragraphs',
    directive:
      'Write it as a short newsletter item: one or two tight paragraphs that stand alone in a ' +
      'feed reader, no preamble and no sign-off. Assume the reader sees only this. Every ' +
      'sentence must carry information.',
  },
  {
    id: 'brief',
    label: 'Plain brief',
    hint: 'Just the facts, no voice at all.',
    shape: 'three to six bullet points, one fact each',
    directive:
      'Write it as a plain factual brief: bullet points, one fact per bullet, no voice, no ' +
      'framing, no adjectives that are not in the sources. This is for someone who wants the ' +
      'findings and nothing else.',
  },
];

export const DEFAULT_FORMAT: OutputFormat = 'newspaper';

export function getFormat(id?: string): FormatSpec {
  return FORMATS.find((f) => f.id === id) ?? (FORMATS[0] as FormatSpec);
}

/** How long, relative to the format's natural shape. */
export type OutputLength = 'short' | 'standard' | 'long';

export const LENGTHS: Record<OutputLength, { label: string; directive: string }> = {
  short: {
    label: 'Short',
    directive: 'Run noticeably shorter than that. Cut to the two or three facts that matter most.',
  },
  standard: {
    label: 'Standard',
    directive: 'That length is right. Let the substance decide within it — never pad to fill.',
  },
  long: {
    label: 'Long',
    directive:
      'You may run longer than that IF the sourcing supports it — more context, more ' +
      'detail, the second-order implications. If it does not, stay short. Length is never ' +
      'a reason to repeat yourself or to speculate.',
  },
};

/** The register the piece is written in. Voice only — never the facts. */
export type OutputTone = 'house' | 'neutral' | 'analytical' | 'conversational' | 'urgent';

export const TONES: Record<OutputTone, { label: string; directive: string }> = {
  house: {
    label: 'House style',
    directive: 'Use the house style given above.',
  },
  neutral: {
    label: 'Neutral',
    directive:
      'Write in plain, neutral, unshowy English. No period voice, no flourish, no opinion. ' +
      'This overrides the house style.',
  },
  analytical: {
    label: 'Analytical',
    directive:
      'Write analytically: state what happened, then what follows from it and why it matters. ' +
      'Reason from the sourced facts only, and say plainly where the evidence runs out. This ' +
      'overrides the house style.',
  },
  conversational: {
    label: 'Conversational',
    directive:
      'Write as if explaining it to a smart colleague: direct, second person where it helps, ' +
      'contractions fine. Never cute, never salesy. This overrides the house style.',
  },
  urgent: {
    label: 'Urgent',
    directive:
      'Write with urgency: short sentences, active voice, the consequence up front. Do not ' +
      'manufacture alarm the sources do not support. This overrides the house style.',
  },
};

export interface CopyShape {
  format?: OutputFormat;
  tone?: OutputTone;
  length?: OutputLength;
}

/**
 * Turn the chosen shape into the block of directions the writer prompt carries. Kept in one
 * place so the first write and any later rewrite ask for exactly the same thing.
 */
export function shapeDirective(shape: CopyShape = {}): string {
  const fmt = getFormat(shape.format);
  const tone = TONES[shape.tone ?? 'house'] ?? TONES.house;
  const length = LENGTHS[shape.length ?? 'standard'] ?? LENGTHS.standard;
  return [
    `FORMAT — ${fmt.label}. ${fmt.directive}`,
    `LENGTH — the natural shape here is ${fmt.shape}. ${length.directive}`,
    `TONE — ${tone.directive}`,
    'None of the above may change a fact, add a claim, or alter how you cite. The citation ' +
      'rules below hold in every format.',
  ].join('\n\n');
}
