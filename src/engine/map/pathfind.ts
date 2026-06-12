/**
 * Deterministic A* and movement-range Dijkstra.
 *
 * Fog honesty: a unit plans with its owner's knowledge — unexplored tiles are
 * assumed passable at cost 1; only *visible* enemy units block; only explored
 * impassables block. Execution (movement.ts) then applies ground truth, so a
 * path into the unknown can fail honestly at the surprising tile.
 *
 * Tie-breaks are total (f, then h, then tile index): identical inputs always
 * produce identical paths on every platform.
 */
import type { Axial, Ctx, GameState, Unit } from '../types';
import { VIS_EXPLORED, VIS_VISIBLE, sortedIds } from '../types';
import { axialOfIndex, hexDistance, neighbors, tileIndex } from '../hex';
import { atWar, isCivilian, isImpassable, moveCostOf, tileOwner } from '../selectors';

interface HeapNode {
  idx: number;
  f: number;
  h: number;
}

class MinHeap {
  private a: HeapNode[] = [];
  get size() {
    return this.a.length;
  }
  private less(i: number, j: number): boolean {
    const x = this.a[i];
    const y = this.a[j];
    return x.f !== y.f ? x.f < y.f : x.h !== y.h ? x.h < y.h : x.idx < y.idx;
  }
  push(n: HeapNode) {
    this.a.push(n);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  pop(): HeapNode | undefined {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(l, m)) m = l;
        if (r < this.a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
        i = m;
      }
    }
    return top;
  }
}

export interface MoveRules {
  /** May `unit` enter this tile, per its owner's knowledge? */
  canEnter(idx: number): boolean;
  /** Planning cost to step onto this tile. */
  cost(idx: number): number;
}

export function moveRulesFor(ctx: Ctx, state: GameState, unit: Unit): MoveRules {
  const pid = unit.owner;
  const vis = state.visibility[pid];
  const civilian = isCivilian(ctx, unit);

  // occupancy snapshot (own units always known; enemies only when visible)
  const militaryBlocked = new Set<number>();
  const civilianBlocked = new Set<number>();
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.id === unit.id) continue;
    const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);
    const known = u.owner === pid || vis[idx] === VIS_VISIBLE;
    if (!known) continue;
    const uCivilian = isCivilian(ctx, u);
    if (u.owner === pid) {
      (uCivilian ? civilianBlocked : militaryBlocked).add(idx);
    } else if (!uCivilian) {
      militaryBlocked.add(idx); // visible enemy military: never walkable
      civilianBlocked.add(idx);
    }
    // visible enemy *civilians* are walkable (capture on entry)
  }

  return {
    canEnter(idx: number): boolean {
      const explored = vis[idx] >= VIS_EXPLORED;
      if (explored && isImpassable(ctx, state, idx)) return false;
      if (civilian ? civilianBlocked.has(idx) : militaryBlocked.has(idx)) return false;
      if (explored) {
        const owner = tileOwner(state, idx);
        if (owner !== null && owner !== pid && !atWar(state, pid, owner)) return false;
      }
      return true;
    },
    cost(idx: number): number {
      return vis[idx] >= VIS_EXPLORED ? moveCostOf(ctx, state, idx) : 1;
    },
  };
}

/** A* from the unit to dest. Returns the step list (excluding start) or null. */
export function findPath(ctx: Ctx, state: GameState, unit: Unit, dest: Axial): Axial[] | null {
  const W = state.mapW;
  const H = state.mapH;
  const start = tileIndex({ q: unit.q, r: unit.r }, W, H);
  const goal = tileIndex(dest, W, H);
  if (goal < 0 || start === goal) return null;
  const rules = moveRulesFor(ctx, state, unit);
  if (!rules.canEnter(goal)) return null;

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  const h0 = hexDistance({ q: unit.q, r: unit.r }, dest);
  dist.set(start, 0);
  heap.push({ idx: start, f: h0, h: h0 }); // f = g + h with g = 0

  while (heap.size) {
    const cur = heap.pop()!;
    if (cur.idx === goal) break;
    const curDist = dist.get(cur.idx)!;
    if (cur.f - cur.h > curDist) continue; // stale entry
    const a = axialOfIndex(cur.idx, W);
    for (const nb of neighbors(a)) {
      const j = tileIndex(nb, W, H);
      if (j < 0 || !rules.canEnter(j)) continue;
      const nd = curDist + rules.cost(j);
      const old = dist.get(j);
      if (old === undefined || nd < old) {
        dist.set(j, nd);
        prev.set(j, cur.idx);
        const h = hexDistance(nb, dest);
        heap.push({ idx: j, f: nd + h, h });
      }
    }
  }

  if (!dist.has(goal)) return null;
  const path: Axial[] = [];
  let cur = goal;
  while (cur !== start) {
    path.push(axialOfIndex(cur, W));
    cur = prev.get(cur)!;
  }
  path.reverse();
  return path;
}

/** Tiles reachable this turn with remaining move points (enter-if-any-mp rule). */
export function reachableTiles(ctx: Ctx, state: GameState, unit: Unit): Map<number, number> {
  const W = state.mapW;
  const H = state.mapH;
  const start = tileIndex({ q: unit.q, r: unit.r }, W, H);
  const rules = moveRulesFor(ctx, state, unit);
  // budget remaining when standing on tile; entering costs tile cost, allowed while budget > 0
  const best = new Map<number, number>([[start, unit.moves]]);
  const out = new Map<number, number>();
  const queue: number[] = [start];
  while (queue.length) {
    // deterministic max-budget-first pop (small frontier; linear scan is fine)
    let bi = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i];
      const b = queue[bi];
      const ba = best.get(a)!;
      const bb = best.get(b)!;
      if (ba > bb || (ba === bb && a < b)) bi = i;
    }
    const cur = queue.splice(bi, 1)[0];
    const budget = best.get(cur)!;
    if (budget <= 0) continue;
    for (const nb of neighbors(axialOfIndex(cur, W))) {
      const j = tileIndex(nb, W, H);
      if (j < 0 || !rules.canEnter(j)) continue;
      const left = Math.max(0, budget - rules.cost(j));
      const old = best.get(j);
      if (old === undefined || left > old) {
        best.set(j, left);
        out.set(j, left);
        queue.push(j);
      }
    }
  }
  return out;
}
