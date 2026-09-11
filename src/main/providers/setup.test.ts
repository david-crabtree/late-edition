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
