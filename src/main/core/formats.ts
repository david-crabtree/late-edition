/**
 * What shape the copy comes out in.
 *
 * The newsroom always wrote one thing: a 1940s wire story. That's the house voice and the
 * default, but the same reporting is worth having as a LinkedIn post, a Reddit write-up, a
 * blog post or a newsletter blurb — and those are genuinely different pieces of writing,
 * not the same text at different lengths.
 *
 * Two rules survive every format, because they are what make the output worth anything:
 * the citation contract (only literal signal ids resolve) and "no invented facts". A
 * format may change the voice and the furniture. It may never loosen either.
 */

export type OutputFormat = 'newspaper' | 'linkedin' | 'reddit' | 'blog' | 'newsletter' | 'brief';

/**
 * How citations should look in the finished piece.
 *   numbered — `[1]` markers in the prose and a numbered source list. Right for anything
 *              that reads as a document.
 *   plain    — no markers in the prose at all; sources listed at the end. Right for social
 *              posts, where a bracketed footnote number is a tell that a machine wrote it.
 */
export type CitationStyle = 'numbered' | 'plain';

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
  citations: CitationStyle;
}

/**
 * The tells that make writing read as machine-made. Every format carries these, because
 * "it sounds like AI" is the most common and most fatal complaint about this kind of
 * output, and it is caused by a small, nameable set of habits.
 */
const NO_TELLS = `Avoid the habits that make writing read as machine-made:
- No "In today's fast-paced world", "It's worth noting", "Let's dive in", "In conclusion",
  "At the end of the day", "game-changer", "landscape", "navigate", "leverage", "delve",
  "robust", "seamless", "unpack", "key takeaway".
- No three-item lists where two items would do, and no rule-of-three cadence on abstract
  nouns ("clarity, confidence and control").
- No sentence that begins "This isn't just X — it's Y", and no "not only… but also".
- No summarising the piece back to the reader at the end. Stop when the point lands.
- No hedging stacks ("may potentially", "could arguably suggest"). Say it or cut it.
- Vary sentence length hard. A long sentence that carries a real clause, then a short one
  that lands. If every sentence is the same length the reader hears a machine.
- Prefer a concrete noun to an abstract one every single time: "a €69 hardware token", not
  "an affordable security solution".
- One idea per sentence, and never restate an idea you've already made.`;

export const FORMATS: FormatSpec[] = [
  {
    id: 'newspaper',
    label: 'Newspaper story',
    hint: 'The house voice — a wire story in the paper’s own style.',
    shape: 'four to six tight paragraphs when well sourced, fewer when thin',
    citations: 'numbered',
    directive:
      'Write it as a newspaper story in the house style above, and commit to that voice — ' +
      'a wire desk in 1948, not a neutral summariser wearing a hat. Lead with the hardest ' +
      'fact you have, not a wind-up. Let the facts carry the judgement: put two of them ' +
      'next to each other and let the reader draw the line, rather than explaining what it ' +
      'means. Earn one dry line somewhere — the kind a subeditor would leave in — but only ' +
      'if the material supports it. No headline (the desk sets that), no sign-off, no ' +
      'bullet points.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn post',
    hint: 'Plain professional English, first person, no hashtag soup.',
    shape: '150 to 250 words in short paragraphs of one or two sentences',
    citations: 'plain',
    directive:
      'Write it as a LinkedIn post in plain modern professional English, first person. Open ' +
      'with the single most surprising concrete fact, stated flat, in one line — never "I am ' +
      'thrilled to share", never a rhetorical question, never "Here\'s what I learned". ' +
      'Short paragraphs, a line of white space between them. Sound like one person who ' +
      'actually read the sources and has a view, not a brand account. End on the thing that ' +
      'is genuinely unresolved, or a plain statement of what it costs someone — not a ' +
      'summary and not "thoughts?". No hashtags, no emoji, no engagement bait. Do not ' +
      'pretend to personal experience you were not given.',
  },
  {
    id: 'reddit',
    label: 'Reddit post',
    hint: 'Conversational, upfront about what is known and what is not.',
    shape: '200 to 400 words, sub-headed if it helps',
    citations: 'plain',
    directive:
      'Write it as a Reddit text post: conversational, direct, no marketing register at all. ' +
      'Open with the substance. Be explicit about what is well sourced and what is thin — ' +
      'that candour is the point on Reddit, and overclaiming gets torn apart in the ' +
      'comments. Short paragraphs, bold sub-heads only if the post genuinely has sections. ' +
      'It is fine to sound irritated by something the sources actually justify being ' +
      'irritated by. No hashtags, no emoji, no sign-off.',
  },
  {
    id: 'blog',
    label: 'Blog post',
    hint: 'Room to explain, with a point of view and a real opening.',
    shape: '500 to 900 words with two or three sub-headings',
    citations: 'numbered',
    directive:
      'Write it as a blog post by someone who went and found this out and is now saving the ' +
      'reader the trip. Open on the specific thing that made it worth writing — a number, a ' +
      'contradiction, a rule that catches people out — not on background. Use two or three ' +
      'sub-headings that say something ("The cheap door is still open"), never labels ' +
      '("Options", "Conclusion"). You have room here: explain the mechanism, not just the ' +
      'outcome, and say plainly where the evidence stops and inference begins. Have a view, ' +
      'and let it come from the facts rather than being announced. End on the practical ' +
      'consequence for the reader, in one or two sentences.',
  },
  {
    id: 'newsletter',
    label: 'Newsletter / RSS blurb',
    hint: 'A tight summary someone can scan in a feed.',
    shape: '80 to 150 words in one or two paragraphs',
    citations: 'plain',
    directive:
      'Write it as a short newsletter item: one or two tight paragraphs that stand alone in ' +
      'a feed reader, no preamble and no sign-off. Assume the reader sees only this. Every ' +
      'sentence must carry information a reader could act on or repeat.',
  },
  {
    id: 'brief',
    label: 'Plain brief',
    hint: 'Just the facts, no voice at all.',
    shape: 'three to six bullet points, one fact each',
    citations: 'numbered',
    directive:
      'Write it as a plain factual brief: bullet points, one fact per bullet, no voice, no ' +
      'framing, no adjectives that are not in the sources. This is for someone who wants the ' +
      'findings and nothing else. The no-tells rules below matter less here — flatness is ' +
      'the point — but never pad and never editorialise.',
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
    directive:
      'Use the house style given above, and actually inhabit it. A house style that only ' +
      'shows up in the first sentence is not a house style.',
  },
  neutral: {
    label: 'Neutral',
    directive:
      'Write in plain, neutral, unshowy English. No period voice, no flourish, no opinion. ' +
      'Plain does not mean bland: keep the sentences varied and the nouns concrete. This ' +
      'overrides the house style.',
  },
  analytical: {
    label: 'Analytical',
    directive:
      'Write analytically: state what happened, then what follows from it and why it matters. ' +
      'Reason from the sourced facts only, show the step from fact to conclusion rather than ' +
      'asserting it, and say plainly where the evidence runs out. This overrides the house ' +
      'style.',
  },
  conversational: {
    label: 'Conversational',
    directive:
      'Write as if explaining it to a smart colleague who will interrupt if you waffle: ' +
      'direct, second person where it helps, contractions fine. Never cute, never salesy. ' +
      'This overrides the house style.',
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

/** How this shape wants its citations rendered. */
export function citationStyle(shape: CopyShape = {}): CitationStyle {
  return getFormat(shape.format).citations;
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
    NO_TELLS,
    'None of the above may change a fact, add a claim, or alter how you cite. The citation ' +
      'rules below hold in every format.',
  ].join('\n\n');
}
