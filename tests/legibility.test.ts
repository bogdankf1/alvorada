import { describe, it, expect } from 'vitest';
import { ctx, flatWorld } from './helpers';
import { victoryProgress } from '../src/engine/selectors';
import { influence } from '../src/engine/selectors';

describe('victoryProgress', () => {
  it('returns the four paths with progress clamped to [0,1]', () => {
    const s = flatWorld(16, 12, 3);
    s.players[0].techs = ['agriculture', 'pottery'];
    const vp = victoryProgress(ctx, s, 0);
    expect(vp.map((p) => p.kind)).toEqual(['conquest', 'science', 'culture', 'score']);
    for (const p of vp) {
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(1);
    }
  });

  it('conquest rises as rivals fall', () => {
    const s = flatWorld(16, 12, 3);
    const before = victoryProgress(ctx, s, 0).find((p) => p.kind === 'conquest')!.pct;
    s.players[1].alive = false;
    const after = victoryProgress(ctx, s, 0).find((p) => p.kind === 'conquest')!.pct;
    expect(after).toBeGreaterThan(before);
  });

  it('culture = influence / (strongest rival culture × dominanceFactor)', () => {
    const s = flatWorld(16, 12, 2);
    s.players[0].cultureTotal = 300;
    s.players[1].cultureTotal = 50;
    const inf0 = influence(ctx, s, 0);
    const expected = Math.min(1, inf0 / (50 * ctx.rules.settings.victory.culture.dominanceFactor));
    const culture = victoryProgress(ctx, s, 0).find((p) => p.kind === 'culture')!.pct;
    expect(culture).toBeCloseTo(expected, 5);
  });
});
