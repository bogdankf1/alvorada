/**
 * Fixture builders: a hand-made flat world for precise scenario tests.
 * Build the scene fully, then act — applyAction freezes its output (Immer).
 */
import type { Ctx, GameState, Unit } from '../src/engine/types';
import type { Ruleset } from '../src/data/types';
import { STANDARD_RULESET } from '../src/data/standard';
import { recomputeVisibility } from '../src/engine/map/visibility';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { tileIndex } from '../src/engine/hex';

/** Flat index of axial (q,r); throws on out-of-map fixtures. */
export function idxOf(state: GameState, q: number, r: number): number {
  const idx = tileIndex({ q, r }, state.mapW, state.mapH);
  if (idx < 0) throw new Error(`fixture coord off map: q=${q} r=${r}`);
  return idx;
}

export const ctx: Ctx = { rules: STANDARD_RULESET };

/** Deep-cloned ruleset for tests that tweak settings (e.g. turn limit). */
export function customCtx(mutate: (rules: Ruleset) => void): Ctx {
  const rules = structuredClone(STANDARD_RULESET);
  mutate(rules);
  return { rules };
}

export function flatWorld(w = 12, h = 10, playerCount = 2): GameState {
  const tiles = Array.from({ length: w * h }, () => ({
    terrain: 'grassland',
    elevation: 'flat',
    feature: null as string | null,
    resource: null as string | null,
    improvement: null as string | null,
    ownerCity: null as number | null,
  }));
  const civOrder = ['rome', 'egypt', 'babylon', 'hellas'];
  const players = Array.from({ length: playerCount }, (_, id) => ({
    id,
    name: `P${id}`,
    civ: civOrder[id % civOrder.length],
    color: '#ffffff',
    controller: 'ai' as const,
    alive: true,
    techs: ['agriculture'],
    researching: null as string | null,
    science: 0,
    gold: 0,
    nextCityName: 0,
  }));
  return {
    schema: SCHEMA_VERSION,
    rulesetId: 'standard',
    config: {
      seed: 1,
      mapW: w,
      mapH: h,
      players: players.map((p) => ({ civ: p.civ, controller: 'ai' as const })),
    },
    rngState: 1,
    turn: 1,
    currentPlayer: 0,
    phase: 'playing',
    mapW: w,
    mapH: h,
    tiles,
    players,
    relations: players.map(() => players.map(() => 'peace' as const)),
    units: {},
    cities: {},
    visibility: players.map(() => new Array<number>(w * h).fill(0)),
    nextUnitId: 1,
    nextCityId: 1,
    eventSeq: 0,
    events: [],
    winner: null,
  };
}

export function spawn(
  state: GameState,
  owner: number,
  def: string,
  q: number,
  r: number,
  patch: Partial<Unit> = {},
): Unit {
  const d = STANDARD_RULESET.units[def];
  if (!d) throw new Error(`unknown unit def ${def}`);
  idxOf(state, q, r); // bounds assertion
  const unit: Unit = {
    id: state.nextUnitId++,
    owner,
    def,
    q,
    r,
    hp: 100,
    moves: d.moves,
    stance: 'none',
    acted: false,
    order: null,
    ...patch,
  };
  state.units[unit.id] = unit;
  return unit;
}

/** Recompute everyone's fog after hand-placing things. */
export function refreshVis(state: GameState): void {
  for (const p of state.players) recomputeVisibility(ctx, state, p.id);
}

/** Unfrozen deep copy (post-applyAction states are frozen by Immer). */
export function thaw(state: GameState): GameState {
  return structuredClone(state);
}

export function declareWarBetween(state: GameState, a: number, b: number): void {
  state.relations[a][b] = 'war';
  state.relations[b][a] = 'war';
}
