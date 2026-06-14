import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, declareWarBetween } from './helpers';
import { promotionSlots, pendingPromotions, availablePromotions } from '../src/engine/selectors';
import { applyAction } from '../src/engine/reducer';
import { attackStrength, defenseStrength } from '../src/engine/systems/combat';
import { validateAction } from '../src/engine/validate';

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

describe('CHOOSE_PROMOTION', () => {
  it('promotes a unit with a pending slot from its available set', () => {
    const s = flatWorld(12, 10, 2);
    const u = spawn(s, 0, 'warrior', 5, 5, { xp: 30 });
    const s2 = applyAction(ctx, s, { type: 'CHOOSE_PROMOTION', player: 0, unit: u.id, promotion: 'combat_i' });
    expect(s2.units[u.id].promotions).toContain('combat_i');
  });
  it('rejects no-slot or an unavailable promotion', () => {
    const s = flatWorld(12, 10, 2);
    const u0 = spawn(s, 0, 'warrior', 5, 5, { xp: 5 });
    expect(validateAction(ctx, s, { type: 'CHOOSE_PROMOTION', player: 0, unit: u0.id, promotion: 'combat_i' }).ok).toBe(false);
    const u1 = spawn(s, 0, 'warrior', 6, 5, { xp: 30 });
    expect(validateAction(ctx, s, { type: 'CHOOSE_PROMOTION', player: 0, unit: u1.id, promotion: 'accuracy' }).ok).toBe(false);
  });
});

describe('promotion turn effects', () => {
  it('mobility grants +1 move at turn start', () => {
    let s = flatWorld(12, 10, 1);
    const u = spawn(s, 0, 'warrior', 5, 5, { promotions: ['mobility'] });
    s = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    expect(s.units[u.id].moves).toBe(ctx.rules.units.warrior.moves + 1);
  });
  it('march heals even after acting; medic adds extra healing', () => {
    let s = flatWorld(12, 10, 1);
    const u = spawn(s, 0, 'warrior', 5, 5, { promotions: ['medic', 'march'], hp: 50, acted: true });
    s = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    expect(s.units[u.id].hp).toBeGreaterThan(55); // base heal (neutral) + medic bonus, despite acted
  });
});
