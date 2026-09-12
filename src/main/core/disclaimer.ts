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
export const PROJECT_URL = 'https://github.com/david-crabtree/late-edition';

/** Where the community is. A link, and nothing embedded. */
export const COMMUNITY_URL = 'https://discord.gg/kmr8wqKJJj';

/** Where somebody can support it, if they want to. Nothing here is ever gated behind it. */
export const SPONSOR_URL = 'https://github.com/sponsors/david-crabtree';

/** Who owns it, for the About screen and the colophon. */
export const COPYRIGHT = 'Copyright 2026 David Crabtree';

/**
 * The name and the characters. Not a threat — a fork is welcome and the licence allows one.
 * It just has to be somebody else's newspaper, with somebody else's name on the masthead.
 */
export const TRADEMARK_NOTICE =
  'Late Edition, the Late Edition masthead and the Late Edition newsroom characters are ' +
  'trademarks of David Crabtree. Forks and derivative works are welcome and must be ' +
  'distributed under a different name.';

/**
 * The licence in words a person will actually read, shown wherever the full text would be
 * a wall. It is a summary and the LICENSE file is what governs; that is said out loud
 * rather than left implied.
 */
export const LICENCE_SUMMARY =
  'Late Edition is free to use, at home or at work, for any purpose. You can read the ' +
  'code, change it and share your changes. The one thing you can’t do is sell it: no ' +
  'charging for the software, no hosting it as a paid service, no paid products built on ' +
  'top of it. The name and the characters belong to David Crabtree, so forks need their ' +
  'own name. Full terms in the LICENSE file.';

/**
 * What leaves the machine, stated exactly.
 *
 * The update check is named here rather than tucked into a footnote. A privacy statement
 * with an unmentioned exception is worth less than no statement, because the exception is
 * what somebody was checking for.
 */
export const PRIVACY_STATEMENT =
  'Late Edition runs entirely on your computer. It has no servers, no accounts and no ' +
  'analytics. The only network traffic is to the sources you configure, to the AI ' +
  'providers you have already signed in to on your own machine, and to GitHub to ask ' +
  'whether a newer version exists — which sends nothing about you and which you can turn ' +
  'off. What those providers do with your data is governed by their terms, not ours. ' +
  'Nothing is sent to David Crabtree, ever.';

/**
 * The credit line, for the foot of anything this software produces. It sits under the
 * notice rather than inside it, so the notice stays about the output and this stays about
 * where the output came from.
 */
export function sourceLine(): string {
  const home = PROJECT_URL ? `: ${PROJECT_URL}` : '';
  return `Written by ${PROJECT_NAME}, an AI newsroom you run on your own machine${home}`;
}

/** Shown once, at first run, before anyone briefs the Chief. */
export const FIRST_RUN_NOTICE = [
  {
    heading: 'It is not journalism',
    body:
      'Late Edition runs AI agents on your machine and lays their output out as a ' +
      'newspaper. The newspaper is a presentation style, not a claim that the contents ' +
      'are true. What it writes can be wrong, out of date, or invented outright, ' +
      'including its sources. Treat every edition as an unchecked draft, and verify it ' +
      'yourself before you publish or act on any of it.',
  },
  {
    heading: 'It runs on your accounts',
    body:
      'The agents run under your own accounts and their usage counts against your own ' +
      'plans or bills. You are responsible for that usage, for what you do with the ' +
      'output, and for complying with the terms of whichever AI provider you point it at.',
  },
  {
    heading: 'Nothing about you leaves this machine',
    body: PRIVACY_STATEMENT,
  },
  {
    heading: 'Yours to use, not to sell',
    body: `${LICENCE_SUMMARY} Provided as-is, with no warranty and no liability accepted.`,
  },
];

/** Shown in Setup next to a metered API key, where usage costs real money. */
export const API_BILLING_NOTICE =
  'This agent is billed per use against your own API key. Every run spends real money and ' +
  'we cannot see or cap what you are charged. Watch your provider dashboard, not ours.';

/** Shown in Setup next to a signed-in plan, where usage draws on an allowance. */
export const PLAN_BILLING_NOTICE =
  'This agent is signed in on a plan. Work counts against that plan’s allowance in the ' +
  'normal way and is not billed per use.';
