import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { initialState } from '../src/engine/state';
import { ctx } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { attitude, agendaKnown } from '../src/engine/diplomacy-eval';
import { flatWorld, spawn, refreshVis, thaw, declareWarBetween } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { considerWarForTest } from '../src/ai/decide';
import { traitWeights } from '../src/engine/selectors';
import { tileIndex } from '../src/engine/hex';
import { processObligations } from '../src/engine/systems/diplomacy';

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
  it('schema is 9', () => { expect(SCHEMA_VERSION).toBe(9); });
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

  it('pacifist agenda ignores the ever-present barbarian war but fires on a human war', () => {
    let s = flatWorld(16, 12, 3);
    s.players[0].civ = 'babylon';              // agenda 'pacifist' = dislikesWarmongers
    s.players[0].hiddenAgenda = 'territorial'; // keep the hidden one from interfering
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    const fires = () => attitude(ctx, s, 0, 1).factors.some((f) => /warmongering/.test(f.label));
    expect(fires()).toBe(false);   // player 1 is at war only with barbarians
    declareWarBetween(s, 1, 2);     // now at war with a human
    expect(fires()).toBe(true);
  });

  it('hidden agenda is concealed until the reveal turn', () => {
    let s = flatWorld(12, 10, 2);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    s.relations[0][1].firstContactTurn = 1; s.relations[1][0].firstContactTurn = 1; s.turn = 5;
    expect(agendaKnown(ctx, s, 0, 1).hidden).toBe(false); // 5 - 1 < 15
    s.turn = 20;
    expect(agendaKnown(ctx, s, 0, 1).hidden).toBe(true);  // 20 - 1 >= 15
    expect(agendaKnown(ctx, s, 0, 1).historical).toBe(true); // always once met
  });
});

describe('traits bias the AI', () => {
  it('aggregates trait weights', () => {
    let s = flatWorld(12, 10, 2);
    s.players[0].traits = ['warmonger'];
    expect(traitWeights(ctx, s, 0).military).toBe(2);
    expect(traitWeights(ctx, s, 0).warThreshold).toBeCloseTo(-0.2);
    s.players[0].traits = ['defensive'];
    expect(traitWeights(ctx, s, 0).warTurnGate).toBe(15);
  });

  it('a warmonger declares war at a lower power ratio than a defensive leader', () => {
    // Build two identical states; only the attacker's traits differ.
    function setup(traits: string[]) {
      let s = flatWorld(20, 14, 2);
      s.turn = 60;
      s.players[0].traits = traits;
      const ours = spawn(s, 0, 'settler', 4, 7);
      const theirs = spawn(s, 1, 'settler', 12, 7);
      refreshVis(s);
      s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: ours.id });
      s = applyAction(ctx, { ...s, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: theirs.id });
      s = thaw(s);
      s.relations[0][1].met = true; s.relations[1][0].met = true;
      // give player 0 a modest edge: 3 warriors vs 2
      for (let i = 0; i < 3; i++) spawn(s, 0, 'warrior', 4 + i, 8);
      for (let i = 0; i < 2; i++) spawn(s, 1, 'warrior', 12 + i, 8);
      refreshVis(s);
      // mark the rival's city as explored so considerWar can see it
      for (const c of Object.values(s.cities)) {
        if (c.owner === 1) {
          const idx = tileIndex({ q: c.q, r: c.r }, s.mapW, s.mapH);
          s.visibility[0][idx] = 1; // VIS_EXPLORED
        }
      }
      return thaw(s);
    }
    const warmonger = considerWarForTest(ctx, setup(['warmonger']), 0);
    const defensive = considerWarForTest(ctx, setup(['defensive']), 0);
    expect(warmonger?.action.type).toBe('DECLARE_WAR'); // lowered ratio → attacks
    expect(defensive).toBeNull();                         // raised ratio → holds
  });
});

describe('attitude-shift notifications', () => {
  it('emits an event (to the felt-about player) when a leader\'s band worsens to wary', () => {
    let s = flatWorld(16, 12, 2);
    s.players[0].civ = 'babylon'; // pacifist agenda (dislikesWarmongers)
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 1, 'settler', 11, 6);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, { ...s, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: b.id });
    s = thaw(s);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    s.relations[0][1].lastBand = 'neutral';
    // make player 1 a warmonger in babylon's eyes: at war with the barbarians is already true,
    // so the pacifist agenda fires; also stamp a grudge to push the band down.
    s.relations[0][1].grudge = 40;
    const seqBefore = s.eventSeq;
    processObligations(ctx, s, 0);
    const shift = s.events.find((e) => e.seq >= seqBefore && e.type === 'attitudeShift');
    expect(shift).toBeDefined();
    expect(shift!.player).toBe(1); // the player being felt about hears "X has grown wary of you"
    expect(s.relations[0][1].lastBand).not.toBe('neutral'); // updated
  });
});
