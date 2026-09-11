import { describe, expect, it } from 'vitest';
import { listProviders } from './registry.js';

/**
 * What it takes to get an agent working, checked as data rather than as prose.
 *
 * The first person to try this who was not a developer could not open a terminal, did not
 * know one was needed, and gave up. The steps were printed in the panel the whole time.
 * They are structured now so the app can open the download page or a terminal sitting at
 * the command, which is only possible while every step carries the thing it needs.
 */
describe('the setup steps for each agent', () => {
  const real = () => listProviders().filter((p) => p.maturity !== 'internal');

  it('exist for every agent a person could pick', () => {
    for (const p of real()) {
      expect(p.setup, `${p.id} has no setup steps`).toBeTruthy();
      expect((p.setup ?? []).length, `${p.id} has no setup steps`).toBeGreaterThan(0);
    }
  });

  it('say what each step is FOR, not just what to type', () => {
    for (const p of real()) {
      for (const step of p.setup ?? []) {
        expect(step.text.length, `${p.id}: a step with no text`).toBeGreaterThan(8);
        // The command belongs in its own field, where the app can act on it. A step whose
        // text IS the command is the old flat list wearing a new shape.
        if (step.command) expect(step.text).not.toContain(step.command);
      }
    }
  });

  it('tells a stranger what the agent actually is', () => {
    for (const p of real()) {
      expect(p.blurb, `${p.id} has no blurb`).toBeTruthy();
      expect((p.blurb ?? '').length).toBeGreaterThan(40);
    }
  });

  // Every route to a working newsroom passes through a terminal or a download. A panel of
  // steps the app cannot act on is the same dead end in a nicer font — so an agent either
  // gives the app something to open, or says plainly why nobody can help.
  it('gives every agent something to act on, or admits it cannot', () => {
    for (const p of real()) {
      const actionable = (p.setup ?? []).filter((s) => s.url || s.command);
      if (actionable.length === 0) {
        expect(p.manualOnly, `${p.id}: no actionable step and no explanation`).toBeTruthy();
        expect((p.manualOnly ?? '').length).toBeGreaterThan(40);
      }
    }
  });

  // These addresses get handed to the operating system to open.
  it('only points at https addresses', () => {
    for (const p of real()) {
      for (const step of p.setup ?? []) {
        if (step.url) expect(step.url, `${p.id}: ${step.url}`).toMatch(/^https:\/\//);
      }
    }
  });
});

/**
 * The model box takes free text and hands it straight to the agent's own command line,
 * and every agent wants a different shape — an alias for one, a bare id for another, and
 * `provider/model` for OpenCode. Nothing said so, so the only way to find out you had it
 * wrong was a desk failing mid-edition, after the desks before it had already spent.
 */
describe('what goes in the model box', () => {
  const real = () => listProviders().filter((p) => p.maturity !== 'internal');

  it('is described for every agent a person could pick', () => {
    for (const p of real()) {
      const syn = p.capabilities.modelSyntax;
      expect(syn, `${p.id} says nothing about its model names`).toBeTruthy();
      expect((syn?.hint ?? '').length).toBeGreaterThan(20);
    }
  });

  it('carries a usable pattern and a reason wherever it claims a strict shape', () => {
    for (const p of real()) {
      const syn = p.capabilities.modelSyntax;
      if (!syn?.pattern) continue;
      expect(() => new RegExp(syn.pattern as string), `${p.id}: bad pattern`).not.toThrow();
      expect(syn.whenWrong, `${p.id}: a pattern with nothing to say`).toBeTruthy();
    }
  });

  // The slash in OpenCode's names is the thing nobody guesses.
  it('knows OpenCode wants provider/model', () => {
    const oc = listProviders().find((p) => p.id === 'opencode');
    const re = new RegExp(oc?.capabilities.modelSyntax?.pattern ?? '');
    expect(re.test('anthropic/claude-sonnet-4-5')).toBe(true);
    expect(re.test('claude-sonnet-4-5')).toBe(false);
    expect(re.test('')).toBe(false);
  });

  // Our own lists have to pass our own check, or the box argues with its own suggestions.
  it('offers nothing that its own check would reject', () => {
    for (const p of real()) {
      const pattern = p.capabilities.modelSyntax?.pattern;
      if (!pattern) continue;
      const re = new RegExp(pattern);
      for (const m of p.capabilities.models ?? []) {
        expect(re.test(m), `${p.id} lists "${m}" but its own pattern rejects it`).toBe(true);
      }
      for (const [desk, m] of Object.entries(p.capabilities.recommend ?? {})) {
        if (m) expect(re.test(m), `${p.id} recommends "${m}" for ${desk}`).toBe(true);
      }
    }
  });
});
