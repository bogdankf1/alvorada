/**
 * Barbarians: a hostile independent faction. Camps (placed at init) spawn
 * raiders deterministically (seeded rngState) and pay a bounty when cleared.
 */
import type { Axial, Ctx, GameState, Unit } from '../types';
import { axialOfIndex, hexDistance, ring, tileIndex } from '../hex';
import { isImpassable, militaryAt } from '../selectors';
import { drawInt } from '../rng';
import { pushEvent } from '../events';

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

function barbUnitForTurn(turn: number): string {
  if (turn < 40) return 'warrior';
  if (turn < 90) return 'archer';
  if (turn < 150) return 'spearman';
  return 'pikeman';
}

export function spawnBarbarians(ctx: Ctx, state: GameState): void {
  const b = ctx.rules.settings.barbarians;
  if (state.turn % b.spawnEveryTurns !== 0) return;
  const owner = barbarianId(state);
  for (const camp of [...state.camps].sort((x, y) => x.id - y.id)) {
    const near = Object.values(state.units).filter(
      (u) => u.owner === owner && hexDistance({ q: u.q, r: u.r }, { q: camp.q, r: camp.r }) <= b.spawnRadius,
    ).length;
    if (near >= b.maxNearCamp) continue;
    const cands: Axial[] = [];
    for (const a of ring({ q: camp.q, r: camp.r }, 1)) {
      const idx = tileIndex(a, state.mapW, state.mapH);
      if (idx < 0 || isImpassable(ctx, state, idx) || state.tiles[idx].ownerCity !== null) continue;
      if (militaryAt(ctx, state, a)) continue;
      cands.push(a);
    }
    if (!cands.length) continue;
    const a = cands[drawInt(state, cands.length)];
    spawnBarbAt(ctx, state, barbUnitForTurn(state.turn), a.q, a.r);
    pushEvent(state, { player: null, type: 'barbarianSpawn', msg: 'Barbarians muster from a camp', q: a.q, r: a.r });
  }
}
