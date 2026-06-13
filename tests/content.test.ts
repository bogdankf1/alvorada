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
