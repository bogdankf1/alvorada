import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';

describe('trait & agenda content', () => {
  it('defines 8 traits and agendas, and validates clean', () => {
    expect(Object.keys(STANDARD_RULESET.traits).length).toBe(8);
    expect(Object.keys(STANDARD_RULESET.agendas).length).toBeGreaterThanOrEqual(6);
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });
  it('gives each playable civ two traits and an agenda', () => {
    for (const id of ['rome', 'egypt', 'babylon', 'hellas']) {
      const c = STANDARD_RULESET.civs[id];
      expect(c.traits?.length, id).toBe(2);
      expect(c.agenda, id).toBeDefined();
      for (const t of c.traits!) expect(STANDARD_RULESET.traits[t], t).toBeDefined();
      expect(STANDARD_RULESET.agendas[c.agenda!], c.agenda).toBeDefined();
    }
  });
});
