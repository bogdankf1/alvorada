import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, customCtx } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { empireHappiness, happinessBreakdown, connectedLuxuries, cityYields, canProduce } from '../src/engine/selectors';
import { processCity, captureCity } from '../src/engine/systems/cities';

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
    // base 9 + Pax Romana 3 - perCity 2 - perPop*3 = 12 - 5 = 7
    const h = empireHappiness(ctx, s, 0);
    expect(h.happy).toBe(12); // 9 base + 3 Pax Romana
    expect(h.unhappy).toBe(2 + 3);
    expect(h.net).toBe(7);
    expect(h.tier).toBe('content');
  });

  it('happiness buildings and happiness wonders add happy', () => {
    const { s, id } = oneCity();
    s.cities[id].buildings.push('colosseum'); // +3
    s.cities[id].buildings.push('circus_maximus');
    s.wondersBuilt['circus_maximus'] = id; // +5
    expect(empireHappiness(ctx, s, 0).happy).toBe(9 + 3 + 3 + 5); // base + Pax Romana + colosseum + circus
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
    // base 9 + Pax Romana 3 + luxuryHappiness 4 = 16 happy
    expect(empireHappiness(ctx, s, 0).happy).toBe(9 + 3 + 4);
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
    s.cities[id].pop = 10; // 9+3 - 2 - 10 = 0 → content
    expect(empireHappiness(ctx, s, 0).tier).toBe('content');
    s.cities[id].pop = 11; // -1 → unhappy
    expect(empireHappiness(ctx, s, 0).tier).toBe('unhappy');
    s.cities[id].pop = 20; // 9+3 - 2 - 20 = -10 → veryUnhappy
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

describe('occupied cities', () => {
  it('captureCity marks the city occupied and unrest clears with a courthouse', () => {
    const { s, id } = oneCity(); // owned by player 0
    captureCity(ctx, s, s.cities[id], 1);
    expect(s.cities[id].owner).toBe(1);
    expect(s.cities[id].occupied).toBe(true);
    const before = empireHappiness(ctx, s, 1).unhappy;
    s.cities[id].buildings.push('courthouse');
    expect(before - empireHappiness(ctx, s, 1).unhappy).toBe(3); // occupiedExtra cleared
  });
});

describe('happiness events', () => {
  it('an unhappy empire emits a warning event at its turn start', () => {
    let s = flatWorld(16, 12, 1);
    const settler = spawn(s, 0, 'settler', 5, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.cities[Object.keys(s.cities).map(Number)[0]].pop = 30; // deeply unhappy
    s = applyAction(ctx, s, { type: 'END_TURN', player: 0 }); // single player → wraps to its own turn start
    expect(s.events.some((e) => e.type === 'unhappy' || e.type === 'veryUnhappy')).toBe(true);
  });
});

import { pickProduction } from '../src/ai/economy';

describe('AI happiness response', () => {
  it('an unhappy city builds a happiness building before other works', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 4;
    s.players[0].techs.push('construction'); // colosseum available
    spawn(s, 0, 'warrior', 5, 5); // garrison so it's not "undefended"
    refreshVis(s);
    const unhappy = customCtx((r) => { r.settings.happiness.perCity = 1000; });
    const pick = pickProduction(unhappy, s, c);
    expect(pick?.item).toEqual({ kind: 'building', id: 'colosseum' });
  });
});

describe('happinessBreakdown', () => {
  it('itemizes helping and hurting sources that sum to the net', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 3;
    c.buildings.push('colosseum'); // +3 happy
    const bd = happinessBreakdown(ctx, s, 0);
    expect(bd.reduce((t, x) => t + x.amount, 0)).toBe(empireHappiness(ctx, s, 0).net);
    expect(bd.find((x) => x.label === 'Empire base')?.amount).toBe(9);
    expect(bd.some((x) => x.label === 'Colosseum' && x.amount === 3)).toBe(true);
    expect(bd.some((x) => x.label.startsWith('Cities') && x.amount < 0)).toBe(true);
    expect(bd.some((x) => x.label.startsWith('Population') && x.amount < 0)).toBe(true);
  });

  it('groups a connected luxury as a positive named source', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    const i = 6 * s.mapW + 5;
    s.tiles[i].ownerCity = c.id;
    s.tiles[i].resource = 'wine';
    s.tiles[i].improvement = 'plantation';
    const lux = happinessBreakdown(ctx, s, 0).find((x) => x.label.startsWith('Luxuries'));
    expect(lux?.amount).toBe(4); // luxuryHappiness
    expect(lux?.label).toContain('Wine');
  });
});
