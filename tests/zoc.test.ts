import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, declareWarBetween } from './helpers';
import { applyAction } from '../src/engine/reducer';

describe('zone of control', () => {
  it('moving adjacent to an at-war enemy military unit ends movement', () => {
    let s = flatWorld(14, 10, 2);
    const mover = spawn(s, 0, 'horseman', 3, 5); // 4 moves
    spawn(s, 1, 'warrior', 7, 5);
    spawn(s, 0, 'settler', 1, 1); // keep player 0 alive through checkElimination
    spawn(s, 1, 'settler', 1, 9); // keep player 1 alive through checkElimination
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: mover.id, path: [{ q: 4, r: 5 }, { q: 5, r: 5 }, { q: 6, r: 5 }] });
    const u = s.units[mover.id];
    expect(u.q).toBe(6); expect(u.r).toBe(5); // halted on the tile adjacent to the enemy
    expect(u.moves).toBe(0);                  // remaining movement consumed
    expect(u.order).toBeNull();               // no auto-resume
  });
  it('commando ignores zone of control', () => {
    let s = flatWorld(14, 10, 2);
    const mover = spawn(s, 0, 'horseman', 3, 5, { promotions: ['commando'] });
    spawn(s, 1, 'warrior', 7, 5);
    spawn(s, 0, 'settler', 1, 1); // keep player 0 alive through checkElimination
    spawn(s, 1, 'settler', 1, 9); // keep player 1 alive through checkElimination
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: mover.id, path: [{ q: 4, r: 5 }, { q: 5, r: 5 }, { q: 6, r: 5 }] });
    expect(s.units[mover.id].moves).toBeGreaterThan(0); // did not halt to 0
  });
});
