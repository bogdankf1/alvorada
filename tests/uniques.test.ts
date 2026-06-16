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
