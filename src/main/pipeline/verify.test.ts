import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldNewsroom } from '../config/scaffold.js';
import type { StoryDraft } from './draft.js';
import { runEdition } from './run.js';
import { LOW_CONFIDENCE, VerificationNeededError, findDoubt, unverifiedNote } from './verify.js';

function story(over: Partial<StoryDraft> = {}): StoryDraft {
  return {
    slug: 's',
    beatId: 'brief',
    beatName: 'The Newsdesk',
    signals: [],
    reporterName: 'A Reporter',
    reporterProviderId: 'fake',
    reports: [],
    ...over,
  } as StoryDraft;
}
const signal = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }) as never);
const report = (confidence: number) => ({ confidence }) as never;

describe('when a desk does not trust what it has', () => {
  it('asks about a story nothing corroborates', () => {
    const d = findDoubt(story({ signals: signal(1), reports: [report(0.9)] }));
    expect(d?.question).toMatch(/Only 1 source/);
    expect(d?.reason).toMatch(/corroborated/);
  });

  it('asks about a story the reporter filed with low confidence', () => {
    const d = findDoubt(story({ signals: signal(5), reports: [report(0.3)] }));
    expect(d?.question).toMatch(/30% sure/);
  });

  it('stays quiet on a well-sourced, confident story', () => {
    expect(findDoubt(story({ signals: signal(5), reports: [report(0.9)] }))).toBeNull();
  });

  it('takes the least confident reporter, not the average', () => {
    const s = story({ signals: signal(5), reports: [report(0.95), report(LOW_CONFIDENCE - 0.1)] });
    expect(findDoubt(s)).not.toBeNull();
  });
});

describe('a run that stops to ask', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'le-verify-'));
    scaffoldNewsroom(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // The whole point of the opt-in: an unattended run must never sit blocked on a question
  // nobody is there to answer.
  it('never asks unless the caller opted in', async () => {
    const res = await runEdition({
      root,
      forceProvider: 'fake',
      brief: 'a thinly sourced topic',
      research: 0,
    });
    expect(res.edition.stories.length).toBeGreaterThan(0);
  });

  it('stops with the question, and resumes when it is answered', async () => {
    const opts = { root, forceProvider: 'fake', brief: 'a thin topic', research: 0 } as const;
    let editionId = '';
    let question = '';
    try {
      await runEdition({ ...opts, askToVerify: true });
      throw new Error('expected the desk to stop and ask');
    } catch (err) {
      expect(err).toBeInstanceOf(VerificationNeededError);
      const v = err as VerificationNeededError;
      editionId = v.editionId;
      question = v.question;
    }
    expect(question).toMatch(/source|sure/i);

    // "No" runs it as it stands — and the paper says so rather than quietly shipping it.
    const res = await runEdition({
      ...opts,
      askToVerify: true,
      resumeId: editionId,
      verifyAnswer: false,
    });
    expect(res.edition.editorsLog.join(' ')).toMatch(/ran unverified/);
  });

  it('does not ask about the same story twice', async () => {
    const opts = { root, forceProvider: 'fake', brief: 'a thin topic', research: 0 } as const;
    let editionId = '';
    try {
      await runEdition({ ...opts, askToVerify: true });
    } catch (err) {
      editionId = (err as VerificationNeededError).editionId;
    }
    // Resuming with an answer must reach the press, not stop on the same doubt again.
    const res = await runEdition({
      ...opts,
      askToVerify: true,
      resumeId: editionId,
      verifyAnswer: false,
    });
    expect(res.editionId).toBe(editionId);
  });
});

describe('the note that goes in the Editor’s Log', () => {
  it('distinguishes a decision from a run that timed out unattended', () => {
    const base = { slug: 's', question: 'Check it?', verified: false };
    expect(unverifiedNote(base)).toMatch(/you said run it/);
    expect(unverifiedNote({ ...base, byDefault: true })).toMatch(/nobody was at the desk/);
  });
});
