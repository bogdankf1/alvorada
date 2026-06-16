import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { ctx, customCtx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { canProduce, cityYields, empireHappiness, productionOptions } from '../src/engine/selectors';
import { processCity } from '../src/engine/systems/cities';

describe('civ-unique validation', () => {
  it('the standard ruleset validates clean', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });

  it('flags a unique that points at an unknown civ or base', () => {
    const bad = customCtx((r) => {
      r.units.broken = { id: 'broken', name: 'Broken', cost: 10, moves: 1, sight: 1, strength: 1,
        class: 'melee', domain: 'land', civ: 'atlantis', replaces: 'nope', art: { glyph: 'club' } };
    }).rules;
    const errs = validateRuleset(bad);
    expect(errs.some((e) => e.includes('unknown civ atlantis'))).toBe(true);
    expect(errs.some((e) => e.includes('replaces unknown'))).toBe(true);
  });
});

describe('canProduce: unique <-> base swap', () => {
  function romeCity(c = ctx) {
    let s = flatWorld(14, 12, 2); // player 0 = rome (helpers civOrder)
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    return { s, city: s.cities[Object.keys(s.cities).map(Number)[0]] };
  }

  it('a civ builds its unique and not the base it replaces; other civs are unaffected', () => {
    const c = customCtx((r) => {
      r.units.test_axe = { id: 'test_axe', name: 'Test Axe', cost: 40, moves: 2, sight: 2, strength: 9,
        class: 'melee', domain: 'land', civ: 'rome', replaces: 'warrior', art: { glyph: 'club' } };
    });
    const { s, city } = romeCity(c);
    expect(canProduce(c, s, city, { kind: 'unit', id: 'test_axe' }).ok).toBe(true);
    expect(canProduce(c, s, city, { kind: 'unit', id: 'warrior' }).ok).toBe(false); // replaced
    s.players[0].civ = 'egypt';
    expect(canProduce(c, s, city, { kind: 'unit', id: 'test_axe' }).ok).toBe(false); // not egypt's
    expect(canProduce(c, s, city, { kind: 'unit', id: 'warrior' }).ok).toBe(true); // egypt keeps the base
  });

  it('productionOptions offers the unique and hides the replaced base', () => {
    const c = customCtx((r) => {
      r.units.test_axe = { id: 'test_axe', name: 'Test Axe', cost: 40, moves: 2, sight: 2, strength: 9,
        class: 'melee', domain: 'land', civ: 'rome', replaces: 'warrior', art: { glyph: 'club' } };
    });
    const { s, city } = romeCity(c);
    const ids = productionOptions(c, s, city).filter((i) => i.kind === 'unit').map((i) => i.id);
    expect(ids).toContain('test_axe');
    expect(ids).not.toContain('warrior');
  });
});

describe('empireCivic ability', () => {
  it('adds per-city yields and empire happiness like a free policy', () => {
    const c = customCtx((r) => {
      r.civs.rome.uniqueAbility = [{ kind: 'empireCivic', effect: { yields: { science: 1 }, happiness: 2 } }];
    });
    let s = flatWorld(14, 12, 2); // player 0 = rome
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    const city = s.cities[Object.keys(s.cities).map(Number)[0]];
    const sci = cityYields(c, s, city).total.science;
    const hap = empireHappiness(c, s, 0).happy;
    s.players[0].civ = 'egypt'; // egypt has no ability in this custom ctx
    expect(sci).toBe(cityYields(c, s, city).total.science + 1);
    expect(hap).toBe(empireHappiness(c, s, 0).happy + 2);
  });
});

describe('wonderProduction ability', () => {
  it('adds flat hammers toward a World Wonder each turn (not to normal builds)', () => {
    const c = customCtx((r) => { r.civs.rome.uniqueAbility = [{ kind: 'wonderProduction', amount: 5 }]; });
    let s = flatWorld(14, 12, 2); // player 0 = rome
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('masonry'); // pyramids (a wonder) available
    const city = s.cities[Object.keys(s.cities).map(Number)[0]];
    city.production = { item: { kind: 'building', id: 'pyramids' }, progress: 0 };
    const base = cityYields(c, s, city).total.production;
    processCity(c, s, city);
    expect(city.production.progress).toBe(base + 5); // base hammers + the +5 wonder bonus
  });
});
