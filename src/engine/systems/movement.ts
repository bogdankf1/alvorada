/**
 * Movement execution against ground truth. Planning (pathfind.ts) used the
 * owner's knowledge; here the world answers — a hidden mountain or an unseen
 * army stops the column where it stands.
 */
import type { Axial, Ctx, GameState, Unit } from '../types';
import { sameHex, tileIndex } from '../hex';
import {
  cityAt,
  civilianAt,
  isCivilian,
  isImpassable,
  militaryAt,
  moveCostOf,
  atWar,
  tileOwner,
} from '../selectors';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';

/** A captured civilian changes flags; captured settlers are pressed into work crews. */
export function captureCivilian(ctx: Ctx, state: GameState, civ: Unit, byPlayer: number): void {
  const def = ctx.rules.units[civ.def];
  const oldOwner = civ.owner;
  civ.owner = byPlayer;
  civ.moves = 0;
  civ.order = null;
  civ.stance = 'none';
  if (def.abilities?.includes('foundCity')) {
    const worker = Object.values(ctx.rules.units).find((u) => u.abilities?.includes('improve'));
    if (worker) civ.def = worker.id;
  }
  pushEvent(state, {
    player: oldOwner,
    type: 'unitCaptured',
    msg: `${def.name} captured by ${state.players[byPlayer].name}!`,
    q: civ.q,
    r: civ.r,
  });
  pushEvent(state, {
    player: byPlayer,
    type: 'unitCaptured',
    msg: `${def.name} captured from ${state.players[oldOwner].name}`,
    q: civ.q,
    r: civ.r,
  });
  recomputeVisibility(ctx, state, oldOwner);
}

export interface MoveResult {
  steps: number;
  blocked: boolean;
}

/**
 * Walk the unit along `path` while move points remain and reality permits.
 * Leftover steps become a goto order; a blocked step cancels orders + events.
 */
export function executeMovePath(ctx: Ctx, state: GameState, unit: Unit, path: Axial[]): MoveResult {
  let steps = 0;
  let blocked = false;
  let capturedFrom: number | null = null;
  const civilianMover = isCivilian(ctx, unit);

  let i = 0;
  for (; i < path.length; i++) {
    if (unit.moves <= 0) break;
    const a = path[i];
    const idx = tileIndex(a, state.mapW, state.mapH);
    if (idx < 0 || !sameOrAdjacent(unit, a, i === 0 ? null : path[i - 1])) {
      blocked = true;
      break;
    }
    if (isImpassable(ctx, state, idx)) {
      blocked = true;
      break;
    }
    const city = cityAt(state, a);
    if (city && city.owner !== unit.owner) {
      blocked = true; // enemy cities fall to ATTACK, never to walking in
      break;
    }
    const owner = tileOwner(state, idx);
    if (owner !== null && owner !== unit.owner && !atWar(state, unit.owner, owner)) {
      blocked = true; // closed borders in peacetime
      break;
    }
    if (militaryAt(ctx, state, a)) {
      const mil = militaryAt(ctx, state, a)!;
      if (mil.owner !== unit.owner || !civilianMover) {
        blocked = true;
        break;
      }
    }
    const civHere = civilianAt(ctx, state, a);
    if (civHere) {
      if (civHere.owner === unit.owner && civilianMover) {
        blocked = true;
        break;
      }
      if (civHere.owner !== unit.owner) {
        if (civilianMover) {
          blocked = true;
          break;
        }
        capturedFrom = civHere.owner;
        captureCivilian(ctx, state, civHere, unit.owner);
      }
    }
    unit.q = a.q;
    unit.r = a.r;
    unit.moves = Math.max(0, unit.moves - moveCostOf(ctx, state, idx));
    unit.acted = true;
    unit.stance = 'none';
    steps++;
  }

  const left = path.slice(steps); // everything past the last completed step
  if (blocked) {
    unit.order = null;
    pushEvent(state, {
      player: unit.owner,
      type: 'unitBlocked',
      msg: `${ctx.rules.units[unit.def].name} cannot continue — path blocked`,
      q: unit.q,
      r: unit.r,
    });
  } else if (left.length > 0 && unit.moves === 0) {
    unit.order = { kind: 'goto', path: left };
  } else {
    unit.order = null;
  }

  if (steps > 0 || capturedFrom !== null) {
    recomputeVisibility(ctx, state, unit.owner);
    if (capturedFrom !== null) recomputeVisibility(ctx, state, capturedFrom);
  }
  return { steps, blocked };
}

function sameOrAdjacent(unit: Unit, step: Axial, prev: Axial | null): boolean {
  const from = prev ?? { q: unit.q, r: unit.r };
  const dq = step.q - from.q;
  const dr = step.r - from.r;
  if (sameHex(from, step)) return false;
  return Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1;
}
