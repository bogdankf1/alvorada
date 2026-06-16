import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { initialState } from '../src/engine/state';
import { ctx } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';

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

describe('leader state init', () => {
  const cfg = { seed: 7, mapW: 24, mapH: 20,
    players: [{ civ: 'rome', controller: 'ai' as const }, { civ: 'egypt', controller: 'ai' as const }] };
  it('schema is 7', () => { expect(SCHEMA_VERSION).toBe(7); });
  it('seeds runtime traits from the civ and a deterministic hidden agenda', () => {
    const a = initialState(cfg, ctx);
    const b = initialState(cfg, ctx);
    expect(a.players[0].traits).toEqual(ctx.rules.civs.rome.traits);
    expect(a.players[0].hiddenAgenda).toBeDefined();
    expect(a.players[0].hiddenAgenda! in ctx.rules.agendas).toBe(true);
    expect(a.players[0].hiddenAgenda).toBe(b.players[0].hiddenAgenda); // deterministic from seed
  });
  it('does not perturb the rng stream (hidden agenda uses a pure hash)', () => {
    const a = initialState(cfg, ctx);
    const b = initialState(cfg, ctx);
    // Both calls produce the same rngState — hidden agenda uses a pure hash, not drawInt
    expect(a.rngState).toBe(b.rngState);
    // The rngState should not be 0 (sanity: the game has consumed RNG for camp placement)
    expect(a.rngState).not.toBe(0);
    // And it should equal what initialState always produced before Task 3 added hiddenAgenda
    expect(a.rngState).toBe(-1890154793); // seeded from config {seed:7, 24x20, rome+egypt}
  });
});
