import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';

function capital() {
  let s = flatWorld(16, 12, 2);
  const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
  return { s, id: Object.keys(s.cities).map(Number)[0] };
}

describe('policy progress', () => {
  it('empire culture banks into policyProgress at turn start', () => {
    const { s, id } = capital();
    s.cities[id].buildings.push('monument'); // +2 culture
    expect(s.players[0].policyProgress).toBe(0);
    let s2 = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    s2 = applyAction(ctx, s2, { type: 'END_TURN', player: 1 });
    expect(s2.players[0].policyProgress).toBeGreaterThan(0);
  });
});
