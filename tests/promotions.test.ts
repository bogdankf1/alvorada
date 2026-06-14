import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, declareWarBetween } from './helpers';
import { promotionSlots, pendingPromotions, availablePromotions } from '../src/engine/selectors';
import { applyAction } from '../src/engine/reducer';
import { attackStrength, defenseStrength } from '../src/engine/systems/combat';

describe('promotion selectors', () => {
  it('XP crosses thresholds into promotion slots', () => {
    const s = flatWorld(12, 10, 2);
    const u = spawn(s, 0, 'warrior', 5, 5, { xp: 26 }); // thresholds [10,25,...] → 2 slots
    expect(promotionSlots(ctx, u)).toBe(2);
    expect(pendingPromotions(ctx, u)).toBe(2);
    u.promotions = ['combat_i'];
    expect(pendingPromotions(ctx, u)).toBe(1);
  });
  it('availablePromotions respects class gate, prereqs, and taken', () => {
    const s = flatWorld(12, 10, 2);
    const u = spawn(s, 0, 'warrior', 5, 5, { xp: 100, promotions: ['combat_i'] }); // warrior = melee
    const ids = availablePromotions(ctx, u).map((p) => p.id);
    expect(ids).toContain('combat_ii'); // prereq combat_i met
    expect(ids).toContain('shock');     // melee-gated
    expect(ids).not.toContain('combat_i'); // already taken
    expect(ids).not.toContain('accuracy'); // ranged/siege only
    expect(ids).not.toContain('march');     // requires medic (not taken)
  });
});

describe('combat XP & promotion bonuses', () => {
  it('an attacker gains XP from a fight', () => {
    let s = flatWorld(14, 10, 2);
    const a = spawn(s, 0, 'warrior', 5, 5);
    spawn(s, 1, 'warrior', 6, 5);
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: a.id, target: { q: 6, r: 5 } });
    expect((s.units[a.id]?.xp ?? 0)).toBeGreaterThan(0);
  });
  it('Combat I raises attack and defense strength', () => {
    const s = flatWorld(12, 10, 2);
    const u = spawn(s, 0, 'warrior', 5, 5); // strength 8
    const before = { atk: attackStrength(ctx, u, {}), def: defenseStrength(ctx, s, u) };
    u.promotions = ['combat_i']; // +15% attack & defense
    expect(attackStrength(ctx, u, {})).toBe(before.atk + Math.floor((8 * 15) / 100));
    expect(defenseStrength(ctx, s, u)).toBe(before.def + Math.floor((8 * 15) / 100));
  });
});
