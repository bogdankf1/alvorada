/**
 * Per-player fog of war: 0 unseen, 1 explored (remembered), 2 visible.
 * Full recompute per player — at our scale (≤ ~1500 tiles, dozens of units)
 * this is microseconds and immune to incremental-update bugs.
 */
import type { Ctx, GameState, PlayerId } from '../types';
import { VIS_EXPLORED, VIS_VISIBLE, sortedIds } from '../types';
import { hexesWithin, tileIndex } from '../hex';

export function recomputeVisibility(ctx: Ctx, state: GameState, player: PlayerId): void {
  const vis = state.visibility[player];
  for (let i = 0; i < vis.length; i++) if (vis[i] === VIS_VISIBLE) vis[i] = VIS_EXPLORED;

  const reveal = (q: number, r: number, range: number) => {
    for (const h of hexesWithin({ q, r }, range)) {
      const idx = tileIndex(h, state.mapW, state.mapH);
      if (idx >= 0) vis[idx] = VIS_VISIBLE;
    }
  };

  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.owner !== player) continue;
    const def = ctx.rules.units[u.def];
    const tile = state.tiles[tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH)];
    const bonus = ctx.rules.elevations[tile.elevation].sightBonus ?? 0;
    reveal(u.q, u.r, def.sight + bonus);
  }
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (c.owner !== player) continue;
    reveal(c.q, c.r, ctx.rules.settings.citySight);
  }
  // owned territory is always visible
  for (let i = 0; i < state.tiles.length; i++) {
    const ownerCity = state.tiles[i].ownerCity;
    if (ownerCity !== null && state.cities[ownerCity]?.owner === player) vis[i] = VIS_VISIBLE;
  }

  // first contact: meeting a rival's unit or city on a visible tile sets `met` both ways
  const mark = (other: PlayerId) => {
    if (other === player) return;
    state.relations[player][other].met = true;
    state.relations[other][player].met = true;
  };
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.owner === player) continue;
    if (vis[tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH)] === VIS_VISIBLE) mark(u.owner);
  }
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (c.owner === player) continue;
    if (vis[tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH)] === VIS_VISIBLE) mark(c.owner);
  }
}

export function isVisible(state: GameState, player: PlayerId, idx: number): boolean {
  return state.visibility[player][idx] === VIS_VISIBLE;
}

export function isExplored(state: GameState, player: PlayerId, idx: number): boolean {
  return state.visibility[player][idx] >= VIS_EXPLORED;
}
