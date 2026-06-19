import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, declareWarBetween, idxOf } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { validateAction } from '../src/engine/validate';
import { applyAction } from '../src/engine/reducer';
import { attackStrength } from '../src/engine/systems/combat';
import { coastalBonusForTest } from '../src/ai/economy';
import { campaignOrdersForTest } from '../src/ai/decide';
import type { Action } from '../src/engine/types';

/** Land west of a sea channel (q in {8,9}); enemy city sits on the west shore at (7,5). */
function shoreWorld() {
  let s = flatWorld(18, 12, 2);
  for (let r = 0; r < s.mapH; r++) for (const q of [8, 9]) {
    const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
  }
  const settler = spawn(s, 1, 'settler', 7, 5);
  s.currentPlayer = 1; // allow player 1 to act
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: settler.id });
  s = thaw(s);
  s.currentPlayer = 0; // restore to player 0 for subsequent actions
  const cityId = Object.keys(s.cities).map(Number)[0];
  return { s, cityId };
}

describe('amphibious assault rule', () => {
  it('an embarked melee unit may attack an adjacent enemy coastal city', () => {
    const { s } = shoreWorld();
    const w = spawn(s, 0, 'warrior', 8, 5); // on water = embarked, adjacent to the city at (7,5)
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'ATTACK', player: 0, unit: w.id, target: { q: 7, r: 5 } }).ok).toBe(true);
  });

  it('an embarked unit still cannot attack a ship / water tile', () => {
    const { s } = shoreWorld();
    const w = spawn(s, 0, 'warrior', 8, 5);
    spawn(s, 1, 'galley', 9, 5); // enemy ship on water, adjacent
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'ATTACK', player: 0, unit: w.id, target: { q: 9, r: 5 } }).ok).toBe(false);
  });

  it('an embarked ranged unit still cannot melee-attack the shore', () => {
    const { s } = shoreWorld();
    const a = spawn(s, 0, 'archer', 8, 5); // ranged, embarked
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'ATTACK', player: 0, unit: a.id, target: { q: 7, r: 5 } }).ok).toBe(false);
  });
});

describe('amphibious penalty & capture', () => {
  it('amphibious attack strength is lower than a normal attack', () => {
    const s = flatWorld(8, 8, 2);
    const w = spawn(s, 0, 'warrior', 3, 3);
    const def = ctx.rules.units['warrior'];
    const normal = attackStrength(ctx, w, { city: true });
    const amphib = attackStrength(ctx, w, { city: true, amphibious: true });
    expect(amphib).toBe(normal + Math.floor((def.strength * ctx.rules.settings.naval.amphibiousAttackPct) / 100));
    expect(amphib).toBeLessThan(normal);
  });

  it('an embarked melee assault that breaks a coastal city captures it and disembarks the attacker', () => {
    const { s, cityId } = shoreWorld();
    s.cities[cityId].hp = 1; // on the brink
    const w = spawn(s, 0, 'warrior', 8, 5); // embarked, adjacent to the city at (7,5)
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    const s2 = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: w.id, target: { q: 7, r: 5 } });
    expect(s2.cities[cityId].owner).toBe(0);                       // captured
    const moved = s2.units[w.id];
    expect(moved.q).toBe(7); expect(moved.r).toBe(5);              // advanced onto the city tile
    expect(s2.tiles[idxOf(s2, 7, 5)].terrain).not.toBe('coast');  // it's land — the attacker disembarked
  });
});

describe('sea invasion', () => {
  it('a gathered army with a sea-only enemy city embarks to assault it', () => {
    const { s, cityId } = shoreWorld(); // enemy city at (7,5) on WEST shore; sea channel q in {8,9}
    // east landmass (q>=10) is land; player 0 stages there
    for (let r = 0; r < s.mapH; r++) for (let q = 10; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'grassland';
    }
    s.currentPlayer = 0;
    const settler = spawn(s, 0, 'settler', 12, 5);
    refreshVis(s);
    let s2 = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s2 = thaw(s2);
    s2.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    declareWarBetween(s2, 0, 1);
    // a strong gathered host beside the staging city so the muster gate (gathered >= cityStrength*2) passes
    const host = [
      spawn(s2, 0, 'warrior', 11, 5), spawn(s2, 0, 'warrior', 12, 6),
      spawn(s2, 0, 'warrior', 11, 6), spawn(s2, 0, 'warrior', 12, 4),
      spawn(s2, 0, 'warrior', 11, 4), spawn(s2, 0, 'warrior', 13, 5),
    ];
    refreshVis(s2);
    // reveal the western landmass (where the enemy city sits) so campaignOrders can target it
    for (let r = 0; r < s2.mapH; r++) for (let q = 0; q < 10; q++) {
      const i = tileIndex({ q, r }, s2.mapW, s2.mapH);
      if (i >= 0) s2.visibility[0][i] = Math.max(s2.visibility[0][i], 1);
    }
    const d = campaignOrdersForTest(ctx, s2, host[0]);
    expect(d?.action.type).toBe('MOVE_UNIT');
    const move = d!.action as Extract<Action, { type: 'MOVE_UNIT' }>;
    expect(move.path.some((p) => s2.tiles[idxOf(s2, p.q, p.r)].terrain === 'coast')).toBe(true); // heads to sea
  });
});

describe('coastal settle preference', () => {
  it('a coastal site gets the coastal bonus; an inland site does not', () => {
    let s = flatWorld(20, 14, 2);
    for (let r = 0; r < s.mapH; r++) for (let q = 12; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
    }
    const coastal = { q: 11, r: 5 }; // beside the sea at q=12 → coastal
    const inland = { q: 3, r: 5 };   // far from water → not coastal
    expect(coastalBonusForTest(ctx, s, coastal)).toBeGreaterThan(0);
    expect(coastalBonusForTest(ctx, s, inland)).toBe(0);
  });
});
