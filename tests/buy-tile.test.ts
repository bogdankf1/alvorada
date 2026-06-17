import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, idxOf } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { tilePurchaseCost, tilePurchaseCheck, buyableTiles } from '../src/engine/selectors';

/** A founded city for player 0 that owns ONLY its centre tile (6,6), with 500 gold. */
function cityWorld(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 6, 6);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  s.players[0].gold = 500;
  for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].ownerCity === id) s.tiles[i].ownerCity = null;
  s.tiles[idxOf(s, 6, 6)].ownerCity = id; // own only the centre
  return { s, id };
}

describe('tilePurchaseCost', () => {
  it('rises by ring distance from the city', () => {
    const { s, id } = cityWorld();
    const c = s.cities[id];
    expect(tilePurchaseCost(ctx, c, { q: c.q + 1, r: c.r })).toBe(50); // ring 1
    expect(tilePurchaseCost(ctx, c, { q: c.q + 2, r: c.r })).toBe(80); // ring 2
  });
});

describe('tilePurchaseCheck / buyableTiles', () => {
  it('accepts an in-range, unowned, territory-adjacent tile', () => {
    const { s, id } = cityWorld();
    expect(tilePurchaseCheck(ctx, s, 0, s.cities[id], { q: 7, r: 6 }).ok).toBe(true);
    expect(buyableTiles(ctx, s, s.cities[id]).some((b) => b.idx === idxOf(s, 7, 6))).toBe(true);
  });
  it('rejects owned, out-of-range, and non-adjacent tiles', () => {
    const { s, id } = cityWorld();
    const c = s.cities[id];
    expect(tilePurchaseCheck(ctx, s, 0, c, { q: 8, r: 6 }).ok).toBe(false);  // dist 2, not adjacent to owned
    expect(tilePurchaseCheck(ctx, s, 0, c, { q: 11, r: 6 }).ok).toBe(false); // dist 5, out of range
    s.tiles[idxOf(s, 7, 6)].ownerCity = id;
    expect(tilePurchaseCheck(ctx, s, 0, c, { q: 7, r: 6 }).ok).toBe(false);  // already owned
  });
});

describe('BUY_TILE', () => {
  it('deducts gold and claims the tile', () => {
    const { s, id } = cityWorld();
    const cost = tilePurchaseCost(ctx, s.cities[id], { q: 7, r: 6 });
    const before = s.players[0].gold;
    const s2 = applyAction(ctx, s, { type: 'BUY_TILE', player: 0, city: id, tile: { q: 7, r: 6 } });
    expect(s2.tiles[idxOf(s2, 7, 6)].ownerCity).toBe(id);
    expect(s2.players[0].gold).toBe(before - cost);
  });
  it('is rejected when unaffordable', () => {
    const { s, id } = cityWorld();
    s.players[0].gold = 0;
    expect(validateAction(ctx, s, { type: 'BUY_TILE', player: 0, city: id, tile: { q: 7, r: 6 } }).ok).toBe(false);
  });
});
