import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn } from './helpers';
import { promotionSlots, pendingPromotions, availablePromotions } from '../src/engine/selectors';

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
