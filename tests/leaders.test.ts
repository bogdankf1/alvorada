import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { initialState } from '../src/engine/state';
import { ctx } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { attitude, agendaKnown } from '../src/engine/diplomacy-eval';
import { flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';

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

describe('agenda & reactivity attitude', () => {
  it('a wonder-loving agenda warms toward a rival with more wonders', () => {
    let s = flatWorld(16, 12, 2);
    s.players[0].civ = 'egypt';     // agenda: monumental (likesWonderBuilders)
    s.players[0].hiddenAgenda = 'territorial'; // ensure the hidden one doesn't also fire here
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 1, 'settler', 11, 6);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, { ...s, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: b.id });
    s = thaw(s);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    const before = attitude(ctx, s, 0, 1).score;
    const rivalCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    rivalCity.buildings.push('pyramids', 'great_library');
    s.wondersBuilt['pyramids'] = rivalCity.id; s.wondersBuilt['great_library'] = rivalCity.id;
    const after = attitude(ctx, s, 0, 1).score;
    expect(after).toBeGreaterThan(before); // agenda respected raises attitude
    expect(attitude(ctx, s, 0, 1).factors.some((f) => /Monument Builder/.test(f.label))).toBe(true);
  });

  it('hidden agenda is concealed until the reveal turn', () => {
    let s = flatWorld(12, 10, 2);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    s.relations[0][1].firstContactTurn = 1; s.turn = 5;
    expect(agendaKnown(ctx, s, 0, 1).hidden).toBe(false); // 5 - 1 < 15
    s.turn = 20;
    expect(agendaKnown(ctx, s, 0, 1).hidden).toBe(true);  // 20 - 1 >= 15
    expect(agendaKnown(ctx, s, 0, 1).historical).toBe(true); // always once met
  });
});
