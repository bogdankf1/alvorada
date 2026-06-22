import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, idxOf } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { allocateCitizens } from '../src/engine/selectors';

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
