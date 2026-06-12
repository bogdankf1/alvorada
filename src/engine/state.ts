/**
 * initialState(config, rules): a complete, ready-to-play game.
 * A game is fully determined by (config, action log) — see PLAN.md §3.3.
 */
import type { Ctx, GameConfig, GameState, Player, Relation, Unit } from './types';
import { tileIndex } from './hex';
import { generateMap } from './map/generate';
import { recomputeVisibility } from './map/visibility';
import { SCHEMA_VERSION } from './serialize';

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
      nextCityName: 0,
    };
  });

  const relations: Relation[][] = players.map(() => players.map(() => 'peace' as Relation));

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
    units: {},
    cities: {},
    visibility: players.map(() => new Array<number>(tiles.length).fill(0)),
    nextUnitId: 1,
    nextCityId: 1,
    eventSeq: 0,
    events: [],
    winner: null,
  };

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

  for (let p = 0; p < playerCount; p++) recomputeVisibility(ctx, state, p);
  return state;
}
