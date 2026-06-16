/**
 * initialState(config, rules): a complete, ready-to-play game.
 * A game is fully determined by (config, action log) — see PLAN.md §3.3.
 */
import type { Ctx, GameConfig, GameState, Player, RelationState, Unit } from './types';

/** Deterministic pick from (seed, id) WITHOUT touching rngState — keeps the rng stream stable. */
function pickHidden(seed: number, id: number, pool: string[]): string {
  let h = (seed ^ (id * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return pool[h % pool.length];
}
import { blankRelation } from './types';
import { tileIndex } from './hex';
import { generateMap } from './map/generate';
import { recomputeVisibility } from './map/visibility';
import { SCHEMA_VERSION } from './serialize';
import { placeCamps } from './systems/barbarians';

export function initialState(config: GameConfig, ctx: Ctx): GameState {
  const { rules } = ctx;
  const { tiles, starts } = generateMap(config, rules);
  const playerCount = config.players.length;

  const players: Player[] = config.players.map((spec, id) => {
    const civ = rules.civs[spec.civ];
    if (!civ) throw new Error(`unknown civ: ${spec.civ}`);
    return {
      id,
      name: spec.name ?? civ.leader,
      civ: civ.id,
      color: civ.color,
      controller: spec.controller,
      alive: true,
      techs: ['agriculture'],
      researching: null,
      science: 0,
      gold: 0,
      faith: 0,
      pantheon: null,
      policies: [],
      policyProgress: 0,
      cultureTotal: 0,
      nextCityName: 0,
      traits: [...(civ.traits ?? [])],
      hiddenAgenda: pickHidden(config.seed, id, Object.keys(rules.agendas).sort()),
    };
  });

  players.push({
    id: playerCount, name: 'Barbarians', civ: 'barbarians', color: rules.civs.barbarians.color,
    controller: 'ai', alive: true, techs: [], researching: null, science: 0, gold: 0,
    faith: 0, pantheon: null, policies: [], policyProgress: 0, cultureTotal: 0, nextCityName: 0, barbarian: true,
  });

  const relations: RelationState[][] = players.map(() => players.map(() => blankRelation()));

  const state: GameState = {
    schema: SCHEMA_VERSION,
    rulesetId: rules.id,
    config,
    rngState: (config.seed ^ 0x51ab1e) | 0,
    turn: 1,
    currentPlayer: 0,
    phase: 'playing',
    mapW: config.mapW,
    mapH: config.mapH,
    tiles,
    players,
    relations,
    proposals: [],
    nextProposalId: 1,
    units: {},
    cities: {},
    visibility: players.map(() => new Array<number>(tiles.length).fill(0)),
    nextUnitId: 1,
    nextCityId: 1,
    wondersBuilt: {},
    tradeRoutes: {},
    nextTradeRouteId: 1,
    religions: {},
    camps: [],
    nextCampId: 1,
    eventSeq: 0,
    events: [],
    winner: null,
    pendingEvent: null,
    chronicle: [],
    firedEvents: [],
  };

  const barb = playerCount;
  for (let x = 0; x < players.length; x++) {
    if (x === barb) continue;
    relations[barb][x].status = 'war'; relations[barb][x].since = 1;
    relations[x][barb].status = 'war'; relations[x][barb].since = 1;
  }

  for (let p = 0; p < playerCount; p++) {
    const start = starts[p];
    for (const defId of rules.settings.startingUnits) {
      const def = rules.units[defId];
      const unit: Unit = {
        id: state.nextUnitId++,
        owner: p,
        def: defId,
        q: start.q,
        r: start.r,
        hp: 100,
        moves: def.moves,
        stance: 'none',
        acted: false,
        order: null,
      };
      state.units[unit.id] = unit;
    }
    // starts never land on mountains, but clear any feature so turn-1 reads clean
    const idx = tileIndex(start, state.mapW, state.mapH);
    tiles[idx].feature = null;
  }

  placeCamps(ctx, state, starts);

  for (let p = 0; p < state.players.length; p++) recomputeVisibility(ctx, state, p);
  return state;
}
