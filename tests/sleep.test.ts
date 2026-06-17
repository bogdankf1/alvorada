import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, declareWarBetween } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { unitNeedsOrders, enemyMilitaryInSight } from '../src/engine/selectors';
import { beginTurn } from '../src/engine/systems/turn';

describe('SLEEP_UNIT', () => {
  it('sleeping sets the sleep stance and spends moves', () => {
    let s = flatWorld(12, 10, 1);
    const w = spawn(s, 0, 'worker', 5, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'SLEEP_UNIT', player: 0, unit: w.id });
    expect(s.units[w.id].stance).toBe('sleep');
    expect(s.units[w.id].moves).toBe(0);
  });

  it('sleeping again toggles the unit awake', () => {
    let s = flatWorld(12, 10, 1);
    const w = spawn(s, 0, 'worker', 5, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'SLEEP_UNIT', player: 0, unit: w.id });
    s = applyAction(ctx, s, { type: 'SLEEP_UNIT', player: 0, unit: w.id });
    expect(s.units[w.id].stance).toBe('none');
  });

  it('moving wakes a sleeping unit', () => {
    let s = flatWorld(12, 10, 1);
    spawn(s, 0, 'settler', 1, 1); // keep player 0 alive through checkElimination
    const w = spawn(s, 0, 'worker', 5, 5, { stance: 'sleep' }); // full moves, asleep
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: w.id, path: [{ q: 6, r: 5 }] });
    expect(s.units[w.id].stance).toBe('none');
  });

  it('sleep persists across a turn start when no enemy is in sight', () => {
    const s = thaw(flatWorld(12, 10, 1));
    const w = spawn(s, 0, 'worker', 5, 5, { stance: 'sleep', moves: 0 });
    refreshVis(s);
    beginTurn(ctx, s, 0);
    expect(s.units[w.id].stance).toBe('sleep');
    expect(s.units[w.id].moves).toBeGreaterThan(0); // moves reset
  });

  it('an enemy military unit in sight wakes a sleeper at turn start', () => {
    const s = thaw(flatWorld(12, 10, 2));
    const w = spawn(s, 0, 'worker', 5, 5, { stance: 'sleep', moves: 0 });
    spawn(s, 1, 'warrior', 6, 5); // adjacent enemy
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    beginTurn(ctx, s, 0);
    expect(s.units[w.id].stance).toBe('none');
  });
});

describe('enemyMilitaryInSight', () => {
  it('true for an at-war military unit in range, false for civilians and peace', () => {
    const s = thaw(flatWorld(12, 10, 2));
    const w = spawn(s, 0, 'worker', 5, 5);
    const enemy = spawn(s, 1, 'warrior', 6, 5);
    refreshVis(s);
    expect(enemyMilitaryInSight(ctx, s, w)).toBe(false); // at peace
    declareWarBetween(s, 0, 1);
    expect(enemyMilitaryInSight(ctx, s, w)).toBe(true);
    enemy.def = 'settler'; // a civilian does not threaten
    expect(enemyMilitaryInSight(ctx, s, w)).toBe(false);
  });
});

describe('unitNeedsOrders', () => {
  it('true for a fresh unit, false once fortified, asleep, spent, acted, or ordered', () => {
    const s = flatWorld(12, 10, 1);
    const u = spawn(s, 0, 'warrior', 5, 5);
    expect(unitNeedsOrders({ ...u })).toBe(true);
    expect(unitNeedsOrders({ ...u, stance: 'fortified' })).toBe(false);
    expect(unitNeedsOrders({ ...u, stance: 'sleep' })).toBe(false);
    expect(unitNeedsOrders({ ...u, moves: 0 })).toBe(false);
    expect(unitNeedsOrders({ ...u, acted: true })).toBe(false);
    expect(unitNeedsOrders({ ...u, order: { kind: 'build', improvement: 'farm', turnsLeft: 2 } })).toBe(false);
  });
});
