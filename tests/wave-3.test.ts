import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, idxOf } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { allocateCitizens } from '../src/engine/selectors';
import { validateAction } from '../src/engine/validate';

/** A founded city for player 0 owning only its centre tile, with a market (1 merchant slot). */
function marketCity() {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 6, 6);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].ownerCity === id) s.tiles[i].ownerCity = null;
  s.tiles[idxOf(s, 6, 6)].ownerCity = id; // own only the centre → no workable tiles
  s.cities[id].buildings.push('market'); // a merchant slot
  s.cities[id].pop = 3;
  return { s, id };
}

describe('specialist pinning', () => {
  it('SET_SPECIALISTS count=0 keeps the pin (force zero), not delete it', () => {
    const { s, id } = marketCity();
    const s2 = applyAction(ctx, s, { type: 'SET_SPECIALISTS', player: 0, city: id, specialist: 'merchant', count: 0 });
    expect(s2.cities[id].forcedSpecialists?.merchant).toBe(0);
  });
  it('without a pin, the allocator auto-assigns a merchant (no workable tiles)', () => {
    const { s, id } = marketCity();
    expect(allocateCitizens(ctx, s, s.cities[id]).specialists.merchant ?? 0).toBeGreaterThan(0);
  });
  it('pinning merchant to 0 forces zero merchants (greedy does not re-add)', () => {
    const { s, id } = marketCity();
    const s2 = applyAction(ctx, s, { type: 'SET_SPECIALISTS', player: 0, city: id, specialist: 'merchant', count: 0 });
    expect(allocateCitizens(ctx, s2, s2.cities[id]).specialists.merchant ?? 0).toBe(0);
  });
  it('pinning merchant to 1 forces exactly one', () => {
    const { s, id } = marketCity();
    const s2 = applyAction(ctx, s, { type: 'SET_SPECIALISTS', player: 0, city: id, specialist: 'merchant', count: 1 });
    expect(allocateCitizens(ctx, s2, s2.cities[id]).specialists.merchant).toBe(1);
  });
});

describe('remove road', () => {
  it('a worker on a road tile can remove it (instant)', () => {
    const s = flatWorld(12, 10, 2);
    const w = spawn(s, 0, 'worker', 4, 4);
    s.tiles[idxOf(s, 4, 4)].road = 'road';
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'REMOVE_ROAD', player: 0, unit: w.id }).ok).toBe(true);
    const s2 = applyAction(ctx, s, { type: 'REMOVE_ROAD', player: 0, unit: w.id });
    expect(s2.tiles[idxOf(s2, 4, 4)].road).toBeNull();
    expect(s2.units[w.id].moves).toBe(0);
  });
  it('removing a road needs a road on the tile and the improve ability', () => {
    const s = flatWorld(12, 10, 2);
    const w = spawn(s, 0, 'worker', 4, 4); // no road here
    const warrior = spawn(s, 0, 'warrior', 5, 5);
    s.tiles[idxOf(s, 5, 5)].road = 'road';
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'REMOVE_ROAD', player: 0, unit: w.id }).ok).toBe(false);       // no road
    expect(validateAction(ctx, s, { type: 'REMOVE_ROAD', player: 0, unit: warrior.id }).ok).toBe(false); // not a worker
  });
});
