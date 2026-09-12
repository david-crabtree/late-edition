/**
 * Which paper this is.
 *
 * The newsroom always wrote one thing: a 1940s wire story. That is the house voice and it
 * is still the default — but the same reporting is worth having as a red-top splash, a
 * broadsheet piece, a business story, agency copy, or a post you can actually put on
 * LinkedIn. Those are not one text at different lengths. They are different papers with
 * different ideas of what the story *is*.
 *
 * So an outlet carries two things, not one:
 *
 *   position — what this outlet leads on, and what it counts as the story. It reaches the
 *              reporter and the editor, so the angle and the placement move with it.
 *   voice    — how the piece is written, including how its headlines are cut.
 *
 * What an outlet never touches is the reporting. The research runs the same way, off the
 * same sources, and two rules survive every outlet because they are what make any of this
 * worth having: the citation contract (only literal signal ids resolve) and "no invented
 * facts". An outlet may change the judgement and the furniture. It may never bend a fact
 * to suit itself.
 *
 * The mastheads are invented. They are written as recognisable *kinds* of paper — a
 * red-top, a broadsheet, a business daily, an agency wire — never as any real title.
 */

export type OutletId =
  | 'newspaper'
  | 'moon'
  | 'chronicle'
  | 'ledger'
  | 'wire'
  | 'circuit'
  | 'blog'
  | 'newsletter'
  | 'linkedin'
  | 'reddit'
  | 'brief';

/** How the picker groups them, and which of them have a front page to lay out. */
export type OutletKind = 'paper' | 'online' | 'social' | 'plain';

/**
 * How citations should look in the finished piece.
 *   numbered — `[1]` markers in the prose and a numbered source list. Right for anything
 *              that reads as a document.
 *   plain    — no markers in the prose at all; sources listed at the end. Right for social
 *              posts, where a bracketed footnote number is a tell that a machine wrote it.
 */
export type CitationStyle = 'numbered' | 'plain';

export interface OutletSpec {
  id: OutletId;
  /** The masthead, as the picker shows it. */
  label: string;
  kind: OutletKind;
  /** One line under the label, so the choice is obvious without trying it. */
  hint: string;
  /**
   * What you actually get, in a few sentences, for the reader choosing between them. This
   * is the only prose here written for a person rather than for an agent — it never goes
   * into a prompt.
   */
  blurb: string;
  /** What this outlet leads on. Goes to the reporter and the editor — this is the angle. */
  position: string;
  /** How this outlet cuts a headline and a standfirst. Goes to the editor. */
  headline: string;
  /** How the piece is written. Goes to the writer. Voice and furniture only. */
  voice: string;
  /** Roughly how long, before the length control scales it. */
  shape: string;
  citations: CitationStyle;
}

/**
 * The tells that make writing read as machine-made. Every outlet carries these, because
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
- One idea per sentence, and never restate an idea you've already made.

And never write about your own working. The reader wants the piece, not the process:
- No paragraph about what the sources do or do not support, what is inference, what you
  can or cannot claim, or how confident you are. If a claim is not sourced, CUT THE CLAIM.
  Do not print a note explaining that you cut it.
- No "that connection is mine to draw", "no source ties", "I want to say that plainly",
  "worth noting that the evidence here is thin". Where a limit genuinely matters to a
  reader, it is one clause inside a sentence that carries a fact, never a paragraph.
- No invented personal reaction: no "what stays with me", "I keep thinking about", "what
  strikes me", no claim to have watched, visited, met or felt anything.
- No sign-off that steps back and comments on the piece you have just written.`;

export const OUTLETS: OutletSpec[] = [
  {
    id: 'newspaper',
    label: 'The house paper',
    kind: 'paper',
    hint: 'Whatever style.md says — the noir wire desk, unless you have rewritten it.',
    blurb:
      'Your own style.md, whatever you have made of it. Out of the box that is a ' +
      '1940s wire desk: terse, dry, unimpressed, and allergic to hype. Edit the ' +
      'file and every desk follows it on the next run.',
    shape: 'four to six tight paragraphs when well sourced, fewer when thin',
    citations: 'numbered',
    position:
      'Lead with what changed and who it hits. The house judgement is set by the style ' +
      'above — follow that rather than reaching for another paper’s instincts.',
    headline:
      'Headlines in the house voice: short, concrete, no pun unless the material genuinely ' +
      'earns one. The standfirst adds a fact the headline had no room for. It never ' +
      'restates the headline in longer words.',
    voice:
      'Write it as a newspaper story in the house style above, and commit to that voice — ' +
      'a wire desk in 1948, not a neutral summariser wearing a hat. Lead with the hardest ' +
      'fact you have, not a wind-up. Let the facts carry the judgement: put two of them ' +
      'next to each other and let the reader draw the line, rather than explaining what it ' +
      'means. Earn one dry line somewhere — the kind a subeditor would leave in — but only ' +
      'if the material supports it. No headline (the desk sets that), no sign-off, no ' +
      'bullet points.',
  },
  {
    id: 'moon',
    label: 'The Moon',
    kind: 'paper',
    hint: 'Red-top daily — loud, human, the price up front.',
    blurb:
      'A red-top. It leads on whoever the story lands on rather than the ' +
      'institution it came out of, puts the price in the opening line, and runs ' +
      'eight or nine very short paragraphs. Blunt but never sneering, and it ' +
      'still cannot print a word the sources do not carry.',
    shape: 'six to ten very short paragraphs',
    citations: 'numbered',
    position:
      'This paper leads on the person a thing happens TO, not the institution it happened ' +
      'in. Find the cost, the number, the name — the detail that would annoy someone ' +
      'reading it on a bus. A policy is not a story until you can say who pays for it. If ' +
      'the sources only support an institutional angle, run that, but say who it lands on.',
    headline:
      'Headlines are five to eight words, present tense, active, no subordinate clause: ' +
      'the loudest TRUE thing you have. A pun is allowed only when it carries the fact ' +
      'rather than replacing it. The standfirst is one plain sentence landing the ' +
      'consequence, and it names the figure if there is one.',
    voice:
      'Write it as a red-top daily would. Short sentences, plain words, one idea each. ' +
      'Open on the thing that reaches the reader and say the number out loud in the first ' +
      'line. Paragraphs of one or two sentences, never more. Never write a sentence a ' +
      'reader has to go back over, and never use a long word where a short one is true. ' +
      'Direct and blunt, never sneering — and never manufacture outrage the sources do not ' +
      'support. The punch comes from the fact being genuinely bad, not from the adjectives.',
  },
  {
    id: 'chronicle',
    label: 'The Chronicle',
    kind: 'paper',
    hint: 'Broadsheet daily — measured, sourced, the context behind it.',
    blurb:
      'A broadsheet. It leads on what the news means rather than only on what ' +
      'happened, and will spend a paragraph establishing that if the story needs ' +
      'it. Careful attribution, room for a real clause, and no jokes.',
    shape: 'six to nine paragraphs with room to develop the argument',
    citations: 'numbered',
    position:
      'This paper leads on what it MEANS, not only on what happened. Establish the context ' +
      'the news sits in: what came before, who is affected beyond the obvious party, and ' +
      'what it sets up next. It will happily run a story whose significance takes a ' +
      'paragraph to establish — but it will not assert significance the sources do not carry.',
    headline:
      'Headlines are measured and specific, eight to twelve words, and may carry a ' +
      'subordinate clause. No pun, no exclamation, no rhetorical question. The standfirst ' +
      'does real work: it adds the context or the qualification the headline had no room for.',
    voice:
      'Write it as a broadsheet daily would: considered, in full sentences, with clauses ' +
      'properly subordinated where the thought actually needs them. Establish the facts, ' +
      'then the context they sit in, then what follows from them. Attribute carefully and ' +
      'keep what is established visibly separate from what is inferred. The authority comes ' +
      'from precision, not from volume — no jokes, no shift of register, no flourish for ' +
      'its own sake.',
  },
  {
    id: 'ledger',
    label: 'The Ledger',
    kind: 'paper',
    hint: 'Business daily — the numbers first, who gains and who pays.',
    blurb:
      'A business daily. Nothing runs without a figure attached to it. It says ' +
      'who gains and who pays inside the first third, compares against prior ' +
      'numbers rather than against feelings, and says plainly when no figure is ' +
      'public.',
    shape: 'five to eight paragraphs, front-loaded with figures',
    citations: 'numbered',
    position:
      'This paper leads on money and consequence: what it costs, what it is worth, who ' +
      'gains and who pays. A development with no figure attached is a story only when it ' +
      'moves one that already exists. Put the numbers in the first two paragraphs, or say ' +
      'plainly that none are public — never substitute an adjective for a figure you do ' +
      'not have.',
    headline:
      'Headlines name the party and the number: who did what, at what scale, in twelve ' +
      'words at most. No adjectives, no pun. The standfirst carries the second figure, or ' +
      'the timing.',
    voice:
      'Write it as a business daily would. Figures first, attributed, in the units the ' +
      'source used. Say who gains and who pays inside the first third. No scene-setting, ' +
      'no colour, no adjective that is not in a source. Comparisons are to prior figures, ' +
      'never to feelings. Where a number is missing, say it is missing and move on.',
  },
  {
    id: 'wire',
    label: 'Continental Wire',
    kind: 'paper',
    hint: 'Agency copy — flat, attributed, cuttable from the bottom.',
    blurb:
      'Agency copy. The most consequential verified fact first, then each ' +
      'paragraph less essential than the one before, so a desk can cut it from ' +
      'the bottom without breaking it. No framing and no opinion; where two ' +
      'parties disagree both get a sentence.',
    shape: 'five to eight mostly single-sentence paragraphs, most important first',
    citations: 'numbered',
    position:
      'A wire service leads on the single most consequential VERIFIED fact and nothing ' +
      'else. No interpretation, no framing, no preference between parties. Where two ' +
      'parties disagree, both get a sentence and neither gets the last word.',
    headline:
      'Headlines are flat and factual: subject, verb, object, under ten words. No pun, no ' +
      'adjective, no question mark. The standfirst is the second most important fact, ' +
      'stated as plainly as the first.',
    voice:
      'Write it as wire copy: an inverted pyramid, the most important fact in the first ' +
      'sentence, every paragraph less essential than the one before it, so a subeditor can ' +
      'cut from the bottom without breaking the story. Attribute every claim in the ' +
      'sentence that carries it. Zero voice, zero opinion, zero flourish. Short paragraphs, ' +
      'usually one sentence each.',
  },
  {
    id: 'circuit',
    label: 'The Circuit',
    kind: 'online',
    hint: 'Tech site — the mechanism, and the vendor claim actually tested.',
    blurb:
      'A technology site, written for someone who already knows the field. It ' +
      'explains the mechanism rather than the announcement, treats a vendor claim ' +
      'as where the reporting starts, and is plain about what is still unreleased ' +
      'or unknown.',
    shape: 'five to eight paragraphs, with the mechanism in the middle third',
    citations: 'numbered',
    position:
      'This site leads on the MECHANISM: not that a thing was announced, but how it works ' +
      'and what it will do to the people who use it. A vendor claim is where the reporting ' +
      'starts, never where it ends. Ask what is genuinely new here and what is a rename of ' +
      'something that already existed, and answer it from the sources.',
    headline:
      'Headlines say the specific thing, not the category, and are written for a reader ' +
      'who already knows the field. Never "revolutionises", never "game-changer". The ' +
      'standfirst carries the caveat or the catch.',
    voice:
      'Write it as a technology news site would for a technically literate reader. Explain ' +
      'the mechanism, not just the outcome. Take the vendor’s claim and say what it does ' +
      'and does not cover. Assume the reader knows the field and does not need the industry ' +
      'explained to them. Be plain about what is still unknown or unreleased. Sceptical ' +
      'without sneering; specific rather than sweeping.',
  },
  {
    id: 'blog',
    label: 'Blog post',
    kind: 'online',
    hint: 'Room to explain, with a point of view and a real opening.',
    blurb:
      'A post by someone who went and found this out and is now saving you the ' +
      'trip. It opens on the specific thing that made it worth writing, carries a ' +
      'view that comes out of the facts, and ends on what it costs you.',
    shape: '500 to 900 words with two or three sub-headings',
    citations: 'numbered',
    position:
      'A post like this leads on the specific thing that made it worth writing down: a ' +
      'number, a contradiction, a rule that catches people out. Not on background, and not ' +
      'on the topic in general.',
    headline:
      'The title says the finding, not the subject area. Specific beats clever. The ' +
      'standfirst is the one-line version of the argument.',
    voice:
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
    kind: 'online',
    hint: 'A tight summary someone can scan in a feed.',
    blurb:
      'One or two tight paragraphs that stand on their own in a feed reader. ' +
      'Every sentence carries something you could act on or repeat. No preamble ' +
      'and no sign-off.',
    shape: '80 to 150 words in one or two paragraphs',
    citations: 'plain',
    position:
      'A newsletter item leads on the one thing a busy reader needs out of this, and drops ' +
      'everything else without apology.',
    headline:
      'A short, flat subject line stating the finding. The standfirst is the one sentence ' +
      'a reader decides on.',
    voice:
      'Write it as a short newsletter item: one or two tight paragraphs that stand alone in ' +
      'a feed reader, no preamble and no sign-off. Assume the reader sees only this. Every ' +
      'sentence must carry information a reader could act on or repeat.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn post',
    kind: 'social',
    hint: 'Plain professional English, first person, no hashtag soup.',
    blurb:
      'First person, plain professional English, with the most surprising ' +
      'concrete fact in the opening line. No hashtags, no engagement bait, ' +
      'nothing thrilled to share. Sources are listed underneath rather than ' +
      'footnoted through the prose.',
    shape: '150 to 250 words in short paragraphs of one or two sentences',
    citations: 'plain',
    position:
      'A post like this leads on the single most surprising concrete fact, and on what it ' +
      'means for people who do this work. No announcement register, no corporate framing, ' +
      'and no claim to personal experience the reporting does not contain.',
    headline:
      'A post has no headline — the desk’s headline is an internal label only, so keep it ' +
      'plain and factual and let the post open itself.',
    voice:
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
    kind: 'social',
    hint: 'Conversational, upfront about what is known and what is not.',
    blurb:
      'Conversational and direct, and explicit about which parts are well sourced ' +
      'and which are thin. On Reddit that candour is what keeps a post standing. ' +
      'No marketing register, no sign-off, and sources listed at the end.',
    shape: '200 to 400 words, sub-headed if it helps',
    citations: 'plain',
    position:
      'A post like this leads on the substance, and is explicit about how well each part is ' +
      'sourced. Overclaiming is what gets torn apart in the comments, so the candour is ' +
      'part of the angle rather than a disclaimer bolted on at the end.',
    headline:
      'A post title that states the substance plainly, no clickbait and no rhetorical ' +
      'question. The standfirst is an internal label only.',
    voice:
      'Write it as a Reddit text post: conversational, direct, no marketing register at all. ' +
      'Open with the substance. Be explicit about what is well sourced and what is thin — ' +
      'that candour is the point on Reddit, and overclaiming gets torn apart in the ' +
      'comments. Short paragraphs, bold sub-heads only if the post genuinely has sections. ' +
      'It is fine to sound irritated by something the sources actually justify being ' +
      'irritated by. No hashtags, no emoji, no sign-off.',
  },
  {
    id: 'brief',
    label: 'Plain brief',
    kind: 'plain',
    hint: 'Just the facts, no voice at all.',
    blurb:
      'No voice at all. Bullet points, one fact each, ordered by how well each ' +
      'one stands up. For when you want the findings and nothing wrapped around ' +
      'them.',
    shape: 'three to six bullet points, one fact each',
    citations: 'numbered',
    position:
      'A brief has no position. Report the findings in order of how well each one is ' +
      'sourced, and let the reader decide what matters.',
    headline:
      'A flat label rather than a headline: the subject, in a few words. The standfirst is ' +
      'the single most load-bearing fact.',
    voice:
      'Write it as a plain factual brief: bullet points, one fact per bullet, no voice, no ' +
      'framing, no adjectives that are not in the sources. This is for someone who wants the ' +
      'findings and nothing else. The no-tells rules below matter less here — flatness is ' +
      'the point — but never pad and never editorialise.',
  },
];

export const DEFAULT_OUTLET: OutletId = 'newspaper';

export function getOutlet(id?: string): OutletSpec {
  return OUTLETS.find((o) => o.id === id) ?? (OUTLETS[0] as OutletSpec);
}

/** Does this outlet have a front page to lay out? A LinkedIn post does not. */
export function hasFrontPage(shape: CopyShape = {}): boolean {
  return getOutlet(shape.outlet).kind === 'paper';
}

/**
 * The newsroom's own `style.md`, but only for the paper that actually has one.
 *
 * Handing a LinkedIn post the house style guide AS WELL as its own voice produced copy
 * that was both at once and neither: a 1940s wire desk's cadence under a first-person
 * post, and — because the house style says "say plainly where the evidence stops" — a
 * whole paragraph of the writer narrating its own sourcing. Every outlet except the house
 * paper gets its voice and nothing else.
 */
export function houseStyleFor(shape: CopyShape = {}, style = ''): string {
  if (getOutlet(shape.outlet).id === 'newspaper') return style;
  return (
    'Not applicable. This piece is not for the house paper, so the newsroom’s own style ' +
    'guide does not apply to it. Write to the voice set out below, and do not reach for ' +
    'the house voice, its period register or its habits.'
  );
}

/** How long, relative to the outlet's natural shape. */
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

/** Which paper this piece is for, and how long it runs. */
export interface CopyShape {
  outlet?: OutletId;
  length?: OutputLength;
}

/** How this shape wants its citations rendered. */
export function citationStyle(shape: CopyShape = {}): CitationStyle {
  return getOutlet(shape.outlet).citations;
}

/**
 * What this outlet counts as the story. Goes to the reporter and to the editor, so the
 * angle a desk proposes and the call the editor makes both move with the masthead — which
 * is the whole point of choosing one. It never touches what was researched.
 */
export function positionDirective(shape: CopyShape = {}): string {
  const o = getOutlet(shape.outlet);
  return [
    `THE PAPER — you are filing for ${o.label} (${o.hint}).`,
    `WHAT IT LEADS ON — ${o.position}`,
    'This changes which angle you take and what you put first. It never changes a fact, ' +
      'adds a claim, or lowers the bar for a source.',
  ].join('\n\n');
}

/** How this outlet cuts a headline and a standfirst. Goes to the editor. */
export function headlineDirective(shape: CopyShape = {}): string {
  return `HEADLINES — ${getOutlet(shape.outlet).headline}`;
}

/**
 * Turn the chosen shape into the block of directions the writer prompt carries. Kept in one
 * place so the first write and any later rewrite ask for exactly the same thing.
 */
export function shapeDirective(shape: CopyShape = {}): string {
  const o = getOutlet(shape.outlet);
  const length = LENGTHS[shape.length ?? 'standard'] ?? LENGTHS.standard;
  return [
    `THE PAPER — ${o.label}. ${o.hint}`,
    `VOICE — ${o.voice}`,
    `LENGTH — the natural shape here is ${o.shape}. ${length.directive}`,
    NO_TELLS,
    'None of the above may change a fact, add a claim, or alter how you cite. The citation ' +
      'rules below hold in every outlet.',
  ].join('\n\n');
}
