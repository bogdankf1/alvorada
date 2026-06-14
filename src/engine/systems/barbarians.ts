/**
 * Barbarians: a hostile independent faction. Camps (placed at init) spawn
 * raiders deterministically (seeded rngState) and pay a bounty when cleared.
 */
import type { Axial, Ctx, GameState, Unit } from '../types';
import { axialOfIndex, hexDistance } from '../hex';
import { isImpassable } from '../selectors';
import { drawInt } from '../rng';

export function barbarianId(state: GameState): number {
  return state.players.findIndex((p) => p.barbarian);
}

function spawnBarbAt(ctx: Ctx, state: GameState, defId: string, q: number, r: number): Unit {
  const def = ctx.rules.units[defId];
  const unit: Unit = { id: state.nextUnitId++, owner: barbarianId(state), def: defId, q, r, hp: 100, moves: def.moves, stance: 'none', acted: false, order: null };
  state.units[unit.id] = unit;
  return unit;
}

/** Place camps on unowned, passable land tiles beyond startSafeRadius of every start; each gets a defender. */
export function placeCamps(ctx: Ctx, state: GameState, starts: Axial[]): void {
  const b = ctx.rules.settings.barbarians;
  const candidates: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    if (isImpassable(ctx, state, i) || state.tiles[i].ownerCity !== null) continue;
    const a = axialOfIndex(i, state.mapW);
    if (starts.some((s) => hexDistance(a, s) < b.startSafeRadius)) continue;
    candidates.push(i);
  }
  for (let k = 0; k < b.campCount && candidates.length > 0; k++) {
    const idx = candidates.splice(drawInt(state, candidates.length), 1)[0];
    const a = axialOfIndex(idx, state.mapW);
    state.camps.push({ id: state.nextCampId++, q: a.q, r: a.r });
    spawnBarbAt(ctx, state, 'warrior', a.q, a.r);
  }
}
