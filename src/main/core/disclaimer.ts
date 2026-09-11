/**
 * One set of words about what this software produces, used everywhere it needs saying:
 * on every rendered edition, in the app's first-run notice, in the Setup panel and in the
 * README. Keeping it here means the paper, the app and the docs can never drift apart —
 * and, critically, that the notice is written into the edition FILES rather than only
 * shown on screen, so it survives being copied, exported or posted somewhere else.
 */

/** Printed on every edition, in both the Markdown and the HTML. Deliberately unmissable. */
export const OUTPUT_DISCLAIMER =
  'Produced by automated software using AI language models. This is not journalism: ' +
  'no reporter wrote it and no editor checked it. It may contain errors, invented ' +
  'detail, or claims attributed to sources that do not support them. Verify everything ' +
  'against the listed sources before relying on it, republishing it, or presenting it ' +
  'as fact. Provided as-is, with no warranty and no liability accepted.';

/** The one-line version, for places with no room for the full notice. */
export const OUTPUT_DISCLAIMER_SHORT =
  'AI-generated. Not journalism. Check the sources before you use it.';

/** What made this. Printed as a name, so the credit survives being copied as plain text. */
export const PROJECT_NAME = 'Late Edition';

/**
 * Where a reader who found this text somewhere else can go to find out what wrote it.
 *
 * Output from this software gets pasted into blogs, posts and documents, sometimes by
 * people who did not generate it and have no idea what it is. A URL travelling with the
 * text is the only thing that gets that reader back to an honest account of what they are
 * reading. Set this and it appears in every artefact; leave it empty and the credit still
 * appears, just without a link.
 */
export const PROJECT_URL = '';

/**
 * The credit line, for the foot of anything this software produces. It sits under the
 * notice rather than inside it, so the notice stays about the output and this stays about
 * where the output came from.
 */
export function sourceLine(): string {
  const home = PROJECT_URL ? `: ${PROJECT_URL}` : '';
  return `Written by ${PROJECT_NAME}, an open-source AI newsroom you run yourself${home}`;
}

/** Shown once, at first run, before anyone briefs the Chief. */
export const FIRST_RUN_NOTICE = [
  'Late Edition runs AI agents on your machine and lays their output out as a newspaper. ' +
    'The newspaper is a presentation style, not a claim that the contents are true.',
  'What it writes can be wrong, out of date, or invented outright, including its sources. ' +
    'Treat every edition as an unchecked draft. If you intend to publish or act on any of ' +
    'it, verify it yourself first.',
  'The agents run under your own accounts and their usage counts against your own plans or ' +
    'bills. You are responsible for that usage, for what you do with the output, and for ' +
    'complying with the terms of whichever AI provider you point it at.',
  'This software is provided as-is under the MIT licence, with no warranty and no liability ' +
    'accepted by its authors.',
];

/** Shown in Setup next to a metered API key, where usage costs real money. */
export const API_BILLING_NOTICE =
  'This agent is billed per use against your own API key. Every run spends real money and ' +
  'we cannot see or cap what you are charged. Watch your provider dashboard, not ours.';

/** Shown in Setup next to a signed-in plan, where usage draws on an allowance. */
export const PLAN_BILLING_NOTICE =
  'This agent is signed in on a plan. Work counts against that plan’s allowance in the ' +
  'normal way and is not billed per use.';
