import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { cityYields } from '../src/engine/selectors';

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

describe('ADOPT_POLICY', () => {
  it('adopts a policy, spends progress, and the effect applies empire-wide', () => {
    const { s, id } = capital();
    s.players[0].policyProgress = 60;
    const before = cityYields(ctx, s, s.cities[id]).total.culture;
    const s2 = applyAction(ctx, s, { type: 'ADOPT_POLICY', player: 0, policy: 'aristocracy' }); // +1 culture/city
    expect(s2.players[0].policies).toContain('aristocracy');
    expect(s2.players[0].policyProgress).toBe(60 - 50);
    expect(cityYields(ctx, s2, s2.cities[id]).total.culture).toBe(before + 1);
  });
  it('rejects a policy whose prereq is missing or progress is short', () => {
    const { s } = capital();
    s.players[0].policyProgress = 200;
    expect(validateAction(ctx, s, { type: 'ADOPT_POLICY', player: 0, policy: 'monarchy' }).ok).toBe(false); // needs aristocracy
    s.players[0].policyProgress = 10;
    expect(validateAction(ctx, s, { type: 'ADOPT_POLICY', player: 0, policy: 'aristocracy' }).ok).toBe(false); // too little culture
  });
});
