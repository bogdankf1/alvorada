/** Barbarian AI: aggressive and simple. Pure, deterministic, fair fog. */
import type { Action, Axial, Ctx, GameState, PlayerId, Unit } from '../engine/types';
import { dist, neighbors, tileIndex } from '../engine/hex';
import { atWar, cityAt, militaryAt, playerCities, playerUnits } from '../engine/selectors';
import { validateAction } from '../engine/validate';
import { findPath } from '../engine/map/pathfind';

function nearestPrey(state: GameState, pid: PlayerId, unit: Unit): Axial | null {
  const vis = state.visibility[pid];
  let best: Axial | null = null;
  let bestD = Infinity;
  for (const p of state.players) {
    if (p.id === pid || p.barbarian) continue;
    for (const u of playerUnits(state, p.id)) {
      const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);
      if (vis[idx] !== 2) continue; // only what we can see
      const d = dist(unit, u);
      if (d < bestD || (d === bestD && best && (u.q < best.q || (u.q === best.q && u.r < best.r)))) { bestD = d; best = { q: u.q, r: u.r }; }
    }
    for (const c of playerCities(state, p.id)) {
      const idx = tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH);
      if (vis[idx] === 0) continue; // known (explored or visible)
      const d = dist(unit, c);
      if (d < bestD) { bestD = d; best = { q: c.q, r: c.r }; }
    }
  }
  return best;
}

export function barbarianDecide(ctx: Ctx, state: GameState, pid: PlayerId): { action: Action; reason: string } {
  const end = { action: { type: 'END_TURN', player: pid } as Action, reason: 'barbarians rest' };
  for (const unit of playerUnits(state, pid)) {
    if (unit.moves <= 0 || unit.order) continue;
    let target: Axial | null = null;
    for (const nb of neighbors({ q: unit.q, r: unit.r })) {
      const m = militaryAt(ctx, state, nb);
      const c = cityAt(state, nb);
      if (m && atWar(state, pid, m.owner)) { target = nb; break; }
      if (c && atWar(state, pid, c.owner)) { target = { q: c.q, r: c.r }; break; }
    }
    if (target) {
      const atk: Action = { type: 'ATTACK', player: pid, unit: unit.id, target };
      if (validateAction(ctx, state, atk).ok) return { action: atk, reason: 'barbarians raid' };
    }
    const dest = nearestPrey(state, pid, unit);
    if (dest) {
      const path = findPath(ctx, state, unit, dest);
      if (path && path.length) {
        const mv: Action = { type: 'MOVE_UNIT', player: pid, unit: unit.id, path };
        if (validateAction(ctx, state, mv).ok) return { action: mv, reason: 'barbarians advance' };
      }
    }
  }
  return end;
}
