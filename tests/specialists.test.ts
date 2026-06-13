import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { allocateCitizens, cityYields } from '../src/engine/selectors';

function oneCity() {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  return { s, id: Object.keys(s.cities).map(Number)[0] };
}

describe('allocateCitizens', () => {
  it('forced specialists are honored and clamped to slots and pop', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 3;
    c.buildings.push('library'); // 1 scientist slot
    c.forcedSpecialists = { scientist: 5 }; // ask for more than the single slot
    const alloc = allocateCitizens(ctx, s, c);
    expect(alloc.specialists.scientist).toBe(1); // clamped to the one slot
    expect(alloc.worked.length).toBe(2); // the remaining 2 citizens work tiles
  });

  it('a forced specialist increases city yields and fills its slot', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 2;
    c.buildings.push('market'); // 1 merchant slot → +3 gold when filled
    const baseline = cityYields(ctx, s, c).total.gold;
    c.forcedSpecialists = { merchant: 1 };
    expect(allocateCitizens(ctx, s, c).specialists.merchant).toBe(1);
    expect(cityYields(ctx, s, c).total.gold).toBeGreaterThan(baseline);
  });

  it('shrinking population re-clamps without error', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.buildings.push('library');
    c.forcedSpecialists = { scientist: 1 };
    c.pop = 1;
    const alloc = allocateCitizens(ctx, s, c);
    expect((alloc.specialists.scientist ?? 0) + alloc.worked.length).toBe(1);
  });
});
