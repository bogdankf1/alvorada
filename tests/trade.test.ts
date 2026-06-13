import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { cityYields } from '../src/engine/selectors';

export function twoCities(): ReturnType<typeof flatWorld> {
  let s = flatWorld(24, 12, 2);
  const a = spawn(s, 0, 'settler', 4, 5);
  const b = spawn(s, 0, 'settler', 12, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
  s = thaw(s);
  s.players[0].techs.push('currency');
  return s;
}

export function metPeaceCities(): ReturnType<typeof flatWorld> {
  let s = flatWorld(24, 12, 2);
  const a = spawn(s, 0, 'settler', 4, 5);
  const b = spawn(s, 1, 'settler', 12, 5);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
  s = thaw(s); s.currentPlayer = 1;
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: b.id });
  s = thaw(s); s.currentPlayer = 0;
  s.players[0].techs.push('currency');
  s.relations[0][1].met = true; s.relations[1][0].met = true;
  return s;
}

describe('establish trade route', () => {
  it('a caravan founds a domestic route and the origin earns the domestic yield', () => {
    let s = twoCities();
    const [c0, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5); // adjacent to the city at (12,5)
    refreshVis(s);
    const beforeProd = cityYields(ctx, s, s.cities[c0]).total.production;
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    expect(Object.keys(s.tradeRoutes).length).toBe(1);
    const route = Object.values(s.tradeRoutes)[0];
    expect(route.kind).toBe('domestic');
    expect(route.fromCity).toBe(c0); // nearest own city to the target
    expect(s.units[car.id]).toBeUndefined(); // caravan consumed
    expect(cityYields(ctx, s, s.cities[c0]).total.production).toBe(beforeProd + 1);
  });

  it('rejects a caravan that has not reached the destination', () => {
    const s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 4, 5); // far from (12,5)
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 }).ok).toBe(false);
  });
});
