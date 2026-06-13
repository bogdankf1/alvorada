import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, customCtx } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { empireHappiness, connectedLuxuries, cityYields, canProduce } from '../src/engine/selectors';
import { processCity } from '../src/engine/systems/cities';

/** Found one city for player 0 and return the thawed state + city id. */
function oneCity(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  return { s, id: Object.keys(s.cities).map(Number)[0] };
}

describe('empireHappiness', () => {
  it('base minus per-city minus per-pop', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 3;
    // base 9 - perCity 2 - perPop*3 = 9 - 2 - 3 = 4
    const h = empireHappiness(ctx, s, 0);
    expect(h.happy).toBe(9);
    expect(h.unhappy).toBe(2 + 3);
    expect(h.net).toBe(4);
    expect(h.tier).toBe('content');
  });

  it('happiness buildings and happiness wonders add happy', () => {
    const { s, id } = oneCity();
    s.cities[id].buildings.push('colosseum'); // +3
    s.cities[id].buildings.push('circus_maximus');
    s.wondersBuilt['circus_maximus'] = id; // +5
    expect(empireHappiness(ctx, s, 0).happy).toBe(9 + 3 + 5);
  });

  it('a connected luxury adds once; duplicates do not stack', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    // two wine tiles inside the city's borders, both improved by plantation
    for (const [q, r] of [[5, 6], [6, 5]] as const) {
      const i = (r * s.mapW) + q;
      s.tiles[i].ownerCity = c.id;
      s.tiles[i].resource = 'wine';
      s.tiles[i].improvement = 'plantation';
    }
    expect(connectedLuxuries(ctx, s, 0)).toEqual(['wine']);
    // base 9 + luxuryHappiness 4 = 13 happy
    expect(empireHappiness(ctx, s, 0).happy).toBe(9 + 4);
  });

  it('an occupied city adds unrest until a pacifying building is present', () => {
    const { s, id } = oneCity();
    s.cities[id].occupied = true;
    const before = empireHappiness(ctx, s, 0).unhappy;
    s.cities[id].buildings.push('courthouse');
    const after = empireHappiness(ctx, s, 0).unhappy;
    expect(before - after).toBe(3); // occupiedExtra
  });

  it('tiers: content at 0, unhappy below 0, veryUnhappy at the threshold', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 7; // 9 - 2 - 7 = 0 → content
    expect(empireHappiness(ctx, s, 0).tier).toBe('content');
    s.cities[id].pop = 8; // -1 → unhappy
    expect(empireHappiness(ctx, s, 0).tier).toBe('unhappy');
    s.cities[id].pop = 17; // 9 - 2 - 17 = -10 → veryUnhappy
    expect(empireHappiness(ctx, s, 0).tier).toBe('veryUnhappy');
  });
});

describe('happiness brake', () => {
  it('very unhappy applies a production penalty to city yields', () => {
    const { s, id } = oneCity();
    s.cities[id].buildings.push('workshop');
    const contentProd = cityYields(ctx, s, s.cities[id]).total.production;
    const vu = customCtx((r) => { r.settings.happiness.perCity = 1000; }); // force net < veryUnhappyAt
    const penalized = cityYields(vu, s, s.cities[id]).total.production;
    expect(penalized).toBe(Math.floor((contentProd * (100 - 33)) / 100));
    expect(penalized).toBeLessThan(contentProd);
  });

  it('an unhappy empire throttles food growth', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 2;
    const s2 = thaw(s); processCity(ctx, s2, s2.cities[id]);
    const contentFood = s2.cities[id].food;
    expect(contentFood).toBeGreaterThan(0);
    const vu = customCtx((r) => { r.settings.happiness.perCity = 1000; });
    const s3 = thaw(s); processCity(vu, s3, s3.cities[id]);
    expect(s3.cities[id].food).toBeLessThan(contentFood);
  });

  it('settlers cannot be produced while the empire is unhappy', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 3;
    expect(canProduce(ctx, s, s.cities[id], { kind: 'unit', id: 'settler' }).ok).toBe(true);
    const unhappy = customCtx((r) => { r.settings.happiness.perCity = 1000; });
    expect(canProduce(unhappy, s, s.cities[id], { kind: 'unit', id: 'settler' }).ok).toBe(false);
  });
});
