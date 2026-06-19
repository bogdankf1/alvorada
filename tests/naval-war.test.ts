import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, declareWarBetween } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { validateAction } from '../src/engine/validate';
import { applyAction } from '../src/engine/reducer';

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
