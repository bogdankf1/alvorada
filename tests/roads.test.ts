import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { ctx, customCtx, spawn, refreshVis, thaw, idxOf, flatWorld } from './helpers';
import { moveCostOf } from '../src/engine/selectors';
import { reachableTiles } from '../src/engine/map/pathfind';
import { beginTurn } from '../src/engine/systems/turn';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';

describe('roads data', () => {
  it('ships a basic road, a move scale, and bumps the schema', () => {
    expect(STANDARD_RULESET.roads.road).toMatchObject({ id: 'road', moveCost: 1, turns: 2 });
    expect(STANDARD_RULESET.settings.moveScale).toBe(2);
    expect(SCHEMA_VERSION).toBe(10);
  });
  it('tiles default to no road', () => {
    const s = flatWorld(8, 8, 1);
    expect(s.tiles[0].road).toBeNull();
  });
});

describe('move-point rescale', () => {
  it('scales terrain cost and reads the road cost', () => {
    const s = flatWorld(12, 10, 1);
    const flat = idxOf(s, 5, 5);
    expect(moveCostOf(ctx, s, flat)).toBe(2); // flat 1 * scale 2
    s.tiles[flat].road = 'road';
    expect(moveCostOf(ctx, s, flat)).toBe(1); // road cost (unscaled)
  });

  it('beginTurn resets moves to def.moves * scale', () => {
    const s = thaw(flatWorld(12, 10, 1));
    const u = spawn(s, 0, 'warrior', 5, 5, { moves: 0 });
    refreshVis(s);
    beginTurn(ctx, s, 0);
    expect(s.units[u.id].moves).toBe(2 * ctx.rules.settings.moveScale); // warrior base 2
  });

  it('off-road reach is identical regardless of scale', () => {
    const s = flatWorld(24, 18, 1);
    const def = ctx.rules.units['horseman'];
    const u = spawn(s, 0, 'horseman', 12, 9);
    refreshVis(s);
    const scale1 = customCtx((r) => { r.settings.moveScale = 1; });
    u.moves = def.moves * 1;
    const r1 = reachableTiles(scale1, s, u).size;
    u.moves = def.moves * 2;
    const r2 = reachableTiles(ctx, s, u).size; // ctx is scale 2
    expect(r2).toBe(r1);
  });

  it('a road lets a unit reach farther than open flat', () => {
    const s = flatWorld(24, 18, 1);
    const def = ctx.rules.units['horseman'];
    const u = spawn(s, 0, 'horseman', 12, 9, { moves: def.moves * ctx.rules.settings.moveScale });
    refreshVis(s);
    const flatReach = reachableTiles(ctx, s, u).size;
    for (let col = 0; col < s.mapW; col++) s.tiles[9 * s.mapW + col].road = 'road';
    const roadReach = reachableTiles(ctx, s, u).size;
    expect(roadReach).toBeGreaterThan(flatReach);
  });
});

describe('BUILD_ROAD', () => {
  it('orders, then completes to tile.road, keeping any improvement', () => {
    const base = thaw(flatWorld(12, 10, 1));
    const w = spawn(base, 0, 'worker', 5, 5);
    base.tiles[idxOf(base, 5, 5)].improvement = 'farm'; // coexists with a road
    refreshVis(base);
    let s = applyAction(ctx, base, { type: 'BUILD_ROAD', player: 0, unit: w.id, road: 'road' });
    expect(s.units[w.id].order).toMatchObject({ kind: 'road', road: 'road' });
    expect(s.units[w.id].moves).toBe(0);
    for (let t = 0; t < ctx.rules.roads.road.turns; t++) { s = thaw(s); beginTurn(ctx, s, 0); }
    expect(s.tiles[idxOf(s, 5, 5)].road).toBe('road');
    expect(s.tiles[idxOf(s, 5, 5)].improvement).toBe('farm'); // unchanged
    expect(s.units[w.id].order).toBeNull();
  });

  it('rejects an existing road and a tech-gated road without the tech', () => {
    const s = thaw(flatWorld(12, 10, 1));
    const w = spawn(s, 0, 'worker', 5, 5);
    refreshVis(s);
    s.tiles[idxOf(s, 5, 5)].road = 'road';
    expect(validateAction(ctx, s, { type: 'BUILD_ROAD', player: 0, unit: w.id, road: 'road' }).ok).toBe(false);
    s.tiles[idxOf(s, 5, 5)].road = null;
    const gated = customCtx((r) => {
      r.roads.rail = { id: 'rail', name: 'Rail', moveCost: 1, turns: 2, requiresTech: 'masonry' };
    });
    expect(validateAction(gated, s, { type: 'BUILD_ROAD', player: 0, unit: w.id, road: 'rail' }).ok).toBe(false);
  });
});
