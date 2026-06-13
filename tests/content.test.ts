import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { canProduce, cityYields } from '../src/engine/selectors';
import { cityStrength } from '../src/engine/systems/combat';

describe('era content', () => {
  // (ruleset cross-reference validity is covered by tests/ruleset.test.ts)

  it('has four eras in order', () => {
    expect(STANDARD_RULESET.eras.map((e) => e.id)).toEqual([
      'ancient', 'classical', 'medieval', 'renaissance',
    ]);
  });

  it('new content is gated by the new techs', () => {
    const u = STANDARD_RULESET.units;
    expect(u.pikeman.requiresTech).toBe('feudalism');
    expect(u.crossbowman.requiresTech).toBe('machinery');
    expect(u.knight.requiresTech).toBe('chivalry');
    expect(u.knight.requiresResource).toBe('horses');
    expect(u.musketman.requiresTech).toBe('gunpowder');
    expect(u.cannon.requiresResource).toBe('iron');
    expect(u.cuirassier.requiresResource).toBe('horses');
    const b = STANDARD_RULESET.buildings;
    expect(b.university.requiresTech).toBe('education');
    expect(b.bank.requiresTech).toBe('banking');
  });

  it('no two techs occupy the same tree position', () => {
    const seen = new Set<string>();
    for (const t of Object.values(STANDARD_RULESET.techs)) {
      const key = `${t.pos.col},${t.pos.row}`;
      expect(seen.has(key), `position clash at ${key} (${t.id})`).toBe(false);
      seen.add(key);
    }
  });
});

describe('wonders: gating', () => {
  function cityState() {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('writing'); // unlock great_library
    return s;
  }

  it('a tech-unlocked wonder is producible', () => {
    const s = cityState();
    expect(canProduce(ctx, s, s.cities[1], { kind: 'building', id: 'great_library' }).ok).toBe(true);
  });

  it('a wonder already built anywhere is not producible', () => {
    const s = cityState();
    s.wondersBuilt['great_library'] = 999; // built by some other city
    expect(canProduce(ctx, s, s.cities[1], { kind: 'building', id: 'great_library' }).ok).toBe(false);
  });

  it('wonders cannot be rush-bought', () => {
    const s = cityState();
    s.players[0].gold = 100000;
    const v = validateAction(ctx, s, { type: 'BUY_ITEM', player: 0, city: 1, item: { kind: 'building', id: 'great_library' } });
    expect(v.ok).toBe(false);
  });
});

describe('wonders: ongoing effects', () => {
  it('empireYields add to every city the owner holds', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 0, 'settler', 9, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
    s = thaw(s);
    const cityIds = Object.keys(s.cities).map(Number);
    const before = cityYields(ctx, s, s.cities[cityIds[1]]).total.food;
    // hanging_gardens built by the first city → +1 food empire-wide
    s.cities[cityIds[0]].buildings.push('hanging_gardens');
    s.wondersBuilt['hanging_gardens'] = cityIds[0];
    const after = cityYields(ctx, s, s.cities[cityIds[1]]).total.food; // the OTHER city benefits
    expect(after).toBe(before + 1);
  });

  it('cityDefense aura raises every owner city\'s strength', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    const before = cityStrength(ctx, s, s.cities[id]);
    s.cities[id].buildings.push('great_wall');
    s.wondersBuilt['great_wall'] = id;
    expect(cityStrength(ctx, s, s.cities[id])).toBe(before + 6);
  });
});

const endTurn = (s: ReturnType<typeof flatWorld>) => applyAction(ctx, s, { type: 'END_TURN', player: s.currentPlayer });
const fullRound = (s: ReturnType<typeof flatWorld>) => {
  const n = s.players.filter((p) => p.alive).length;
  for (let i = 0; i < n; i++) s = endTurn(s);
  return s;
};

describe('wonders: completion', () => {
  function builtWonder(wonderId: string, tech: string) {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push(tech);
    const id = Object.keys(s.cities).map(Number)[0];
    // jump production almost to completion, then finish on the next turn
    s.cities[id].production.item = { kind: 'building', id: wonderId };
    s.cities[id].production.progress = ctx.rules.buildings[wonderId].cost; // already paid
    let guard = 0;
    while (s.wondersBuilt[wonderId] === undefined && guard < 6) { s = fullRound(s); guard++; }
    return { s, id };
  }

  it('completing freeUnit (Pyramids) records the wonder and spawns 2 workers', () => {
    const { s, id } = builtWonder('pyramids', 'masonry');
    expect(s.wondersBuilt['pyramids']).toBe(id);
    expect(Object.values(s.units).filter((u) => u.owner === 0 && u.def === 'worker').length).toBe(2);
  });

  it('completing freeTech (Great Library) grants a tech', () => {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('writing');
    const before = s.players[0].techs.length;
    const id = Object.keys(s.cities).map(Number)[0];
    s.cities[id].production.item = { kind: 'building', id: 'great_library' };
    s.cities[id].production.progress = ctx.rules.buildings.great_library.cost;
    let guard = 0;
    while (s.wondersBuilt['great_library'] === undefined && guard < 6) { s = fullRound(s); guard++; }
    expect(s.players[0].techs.length).toBeGreaterThan(before); // free tech granted
  });

  it('a city racing a just-finished wonder is cleared and refunded gold', () => {
    // city 0 finishes hanging_gardens; another owned city racing it is refunded
    let s = flatWorld(18, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 0, 'settler', 12, 6);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
    s = thaw(s);
    s.players[0].techs.push('mathematics');
    const [c0, c1] = Object.keys(s.cities).map(Number);
    s.cities[c0].production = { item: { kind: 'building', id: 'hanging_gardens' }, progress: ctx.rules.buildings.hanging_gardens.cost };
    s.cities[c1].production = { item: { kind: 'building', id: 'hanging_gardens' }, progress: 40 };
    const goldBefore = s.players[0].gold;
    let guard = 0;
    while (s.wondersBuilt['hanging_gardens'] === undefined && guard < 6) { s = fullRound(s); guard++; }
    // the racing city's item was cleared and ~40 gold refunded
    expect(s.cities[c1].production.item).toBeNull();
    expect(s.players[0].gold).toBeGreaterThan(goldBefore);
  });

  it('refunds a RIVAL city racing the same wonder, to that rival', () => {
    let s = flatWorld(20, 12, 2);
    const mine = spawn(s, 0, 'settler', 4, 5);
    const theirs = spawn(s, 1, 'settler', 15, 6);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: mine.id });
    s = thaw(s);
    s.currentPlayer = 1;
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: theirs.id });
    s = thaw(s);
    s.currentPlayer = 0;
    s.players[0].techs.push('mathematics');
    s.players[1].techs.push('mathematics');
    const myCity = Object.values(s.cities).find((c) => c.owner === 0)!;
    const rivalCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    myCity.production = { item: { kind: 'building', id: 'hanging_gardens' }, progress: ctx.rules.buildings.hanging_gardens.cost };
    rivalCity.production = { item: { kind: 'building', id: 'hanging_gardens' }, progress: 55 };
    const rivalGoldBefore = s.players[1].gold;
    let guard = 0;
    while (s.wondersBuilt['hanging_gardens'] === undefined && guard < 6) { s = fullRound(s); guard++; }
    expect(s.wondersBuilt['hanging_gardens']).toBe(myCity.id);
    const rivalCityAfter = Object.values(s.cities).find((c) => c.owner === 1)!;
    expect(rivalCityAfter.production.item).toBeNull();
    expect(s.players[1].gold).toBeGreaterThan(rivalGoldBefore); // rival refunded, to the rival
  });
});
