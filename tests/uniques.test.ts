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
