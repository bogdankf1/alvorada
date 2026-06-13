import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, declareWarBetween } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { cityYields } from '../src/engine/selectors';
import { processTradeRoutes } from '../src/engine/systems/trade';
import { captureCity } from '../src/engine/systems/cities';
import { axialOfIndex } from '../src/engine/hex';

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

describe('trade route yields', () => {
  it('an international route earns the owner gold and the destination its cut', () => {
    let s = metPeaceCities();
    const myCity = Object.values(s.cities).find((c) => c.owner === 0)!;
    const theirCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    const car = spawn(s, 0, 'caravan', theirCity.q - 1, theirCity.r);
    refreshVis(s);
    const ownerGoldBefore = cityYields(ctx, s, myCity).total.gold;
    const destGoldBefore = cityYields(ctx, s, theirCity).total.gold;
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: theirCity.id });
    s = thaw(s);
    expect(Object.values(s.tradeRoutes)[0].kind).toBe('international');
    const my = Object.values(s.cities).find((c) => c.owner === 0)!;
    const their = Object.values(s.cities).find((c) => c.owner === 1)!;
    expect(cityYields(ctx, s, my).total.gold).toBe(ownerGoldBefore + 4); // international gold
    expect(cityYields(ctx, s, their).total.gold).toBe(destGoldBefore + 2); // destinationGold
  });

  it('friendship multiplies the international yield', () => {
    let s = metPeaceCities();
    const theirCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    const car = spawn(s, 0, 'caravan', theirCity.q - 1, theirCity.r);
    refreshVis(s);
    s.relations[0][1].friends = true; s.relations[1][0].friends = true;
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: theirCity.id });
    s = thaw(s);
    const my = Object.values(s.cities).find((c) => c.owner === 0)!;
    const baseGold = Object.values(s.cities).find((c) => c.owner === 0)!; // reference only
    // 4 gold * (100+50)/100 = 6
    const withRoute = cityYields(ctx, s, my).total.gold;
    s.tradeRoutes = {}; // strip the route to read the baseline
    expect(withRoute - cityYields(ctx, s, my).total.gold).toBe(6);
    void baseGold;
  });
});

describe('trade route lifecycle', () => {
  it('a route is removed when it expires', () => {
    let s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    const rid = Object.keys(s.tradeRoutes).map(Number)[0];
    s.tradeRoutes[rid].expires = s.turn; // due now
    processTradeRoutes(ctx, s, 0);
    expect(s.tradeRoutes[rid]).toBeUndefined();
  });

  it('an at-war enemy on the path plunders the route for the bounty', () => {
    let s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    declareWarBetween(s, 0, 1);
    const route = Object.values(s.tradeRoutes)[0];
    const mid = axialOfIndex(route.path[Math.floor(route.path.length / 2)], s.mapW);
    spawn(s, 1, 'warrior', mid.q, mid.r);
    const goldBefore = s.players[1].gold;
    processTradeRoutes(ctx, s, 0);
    expect(Object.keys(s.tradeRoutes).length).toBe(0);
    expect(s.players[1].gold).toBe(goldBefore + ctx.rules.settings.tradeRoute.pillageBounty);
  });
});

describe('trade route severance', () => {
  it('declaring war cancels international routes between the belligerents', () => {
    let s = metPeaceCities();
    const theirCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    const car = spawn(s, 0, 'caravan', theirCity.q - 1, theirCity.r);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: theirCity.id });
    s = thaw(s);
    expect(Object.keys(s.tradeRoutes).length).toBe(1);
    s = applyAction(ctx, s, { type: 'DECLARE_WAR', player: 0, target: 1 });
    expect(Object.keys(s.tradeRoutes).length).toBe(0);
  });

  it('capturing a city prunes routes touching it', () => {
    let s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    expect(Object.keys(s.tradeRoutes).length).toBe(1);
    captureCity(ctx, s, s.cities[c1], 1);
    expect(Object.keys(s.tradeRoutes).length).toBe(0);
  });
});
