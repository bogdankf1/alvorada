/**
 * Action validation — the gatekeeper a future server runs verbatim.
 * Pure: never mutates. Every reason is human-readable (the UI shows them).
 */
import type { Action, Axial, Ctx, GameState, Unit } from './types';
import { VIS_VISIBLE } from './types';
import { hexDistance, tileIndex } from './hex';
import {
  atWar,
  canProduce,
  cityAt,
  cityDistanceOk,
  isCivilian,
  isImpassable,
  isWater,
  militaryAt,
  purchaseCost,
  tileOwner,
} from './selectors';
import { moveRulesFor } from './map/pathfind';

export type Validation = { ok: true } | { ok: false; reason: string };

const ok: Validation = { ok: true };
const fail = (reason: string): Validation => ({ ok: false, reason });

export function validateAction(ctx: Ctx, state: GameState, action: Action): Validation {
  if (state.phase === 'ended') return fail('the game has ended');
  const player = state.players[action.player];
  if (!player) return fail('unknown player');
  if (!player.alive) return fail('player was eliminated');
  if (action.player !== state.currentPlayer) return fail('not your turn');

  switch (action.type) {
    case 'END_TURN':
      return ok;

    case 'FOUND_CITY': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      const unit = v.unit;
      const def = ctx.rules.units[unit.def];
      if (!def.abilities?.includes('foundCity')) return fail('this unit cannot found cities');
      if (unit.moves <= 0) return fail('no movement left');
      const idx = tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH);
      const tile = state.tiles[idx];
      if (isWater(ctx, tile.terrain)) return fail('cannot settle on water');
      if (ctx.rules.elevations[tile.elevation].impassable) return fail('cannot settle here');
      if (!cityDistanceOk(ctx, state, { q: unit.q, r: unit.r }))
        return fail(`too close to another city (min distance ${ctx.rules.settings.cityMinDist})`);
      const owner = tileOwner(state, idx);
      if (owner !== null && owner !== action.player) return fail('this land belongs to another empire');
      return ok;
    }

    case 'MOVE_UNIT': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      const unit = v.unit;
      if (unit.moves <= 0) return fail('no movement left');
      if (!action.path.length) return fail('empty path');
      if (action.path.length > 256) return fail('path too long');
      let prev: Axial = { q: unit.q, r: unit.r };
      for (const step of action.path) {
        if (hexDistance(prev, step) !== 1) return fail('path steps must be adjacent');
        prev = step;
      }
      const first = tileIndex(action.path[0], state.mapW, state.mapH);
      if (first < 0) return fail('path leaves the map');
      if (!moveRulesFor(ctx, state, unit).canEnter(first)) return fail('that way is blocked');
      const cityThere = cityAt(state, action.path[0]);
      if (cityThere && cityThere.owner !== unit.owner) return fail('enemy cities must be stormed');
      return ok;
    }

    case 'ATTACK': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      const unit = v.unit;
      const def = ctx.rules.units[unit.def];
      if (def.strength <= 0) return fail('civilians cannot attack');
      if (def.ranged) return fail('ranged units attack from afar');
      if (unit.moves <= 0) return fail('no movement left');
      if (hexDistance({ q: unit.q, r: unit.r }, action.target) !== 1)
        return fail('target must be adjacent');
      const city = cityAt(state, action.target);
      const enemy = militaryAt(ctx, state, action.target);
      if (city && city.owner !== action.player) {
        if (!atWar(state, action.player, city.owner)) return fail('you are not at war');
        return ok;
      }
      if (enemy && enemy.owner !== action.player) {
        if (!atWar(state, action.player, enemy.owner)) return fail('you are not at war');
        return ok;
      }
      return fail('nothing to attack there');
    }

    case 'RANGED_ATTACK': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      const unit = v.unit;
      const def = ctx.rules.units[unit.def];
      if (!def.ranged) return fail('this unit has no ranged attack');
      if (unit.moves <= 0) return fail('no movement left');
      const dist = hexDistance({ q: unit.q, r: unit.r }, action.target);
      if (dist < 1 || dist > def.ranged.range) return fail('out of range');
      const idx = tileIndex(action.target, state.mapW, state.mapH);
      if (idx < 0) return fail('target off the map');
      if (state.visibility[action.player][idx] !== VIS_VISIBLE) return fail('target not visible');
      const city = cityAt(state, action.target);
      const enemy = militaryAt(ctx, state, action.target);
      if (city && city.owner !== action.player) {
        if (!atWar(state, action.player, city.owner)) return fail('you are not at war');
        return ok;
      }
      if (enemy && enemy.owner !== action.player) {
        if (!atWar(state, action.player, enemy.owner)) return fail('you are not at war');
        return ok;
      }
      return fail('nothing to attack there');
    }

    case 'BUILD_IMPROVEMENT': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      const unit = v.unit;
      const def = ctx.rules.units[unit.def];
      if (!def.abilities?.includes('improve')) return fail('this unit cannot build');
      if (unit.moves <= 0) return fail('no movement left');
      const imp = ctx.rules.improvements[action.improvement];
      if (!imp) return fail('unknown improvement');
      if (imp.requiresTech && !state.players[action.player].techs.includes(imp.requiresTech))
        return fail(`requires ${ctx.rules.techs[imp.requiresTech].name}`);
      const idx = tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH);
      const tile = state.tiles[idx];
      if (isImpassable(ctx, state, idx)) return fail('cannot improve this terrain');
      const owner = tileOwner(state, idx);
      if (owner !== action.player) return fail('workers build only inside your borders');

      if (imp.clearsFeature) {
        if (!tile.feature) return fail('nothing to clear');
        if (!ctx.rules.features[tile.feature].removable) return fail('cannot be cleared');
        return ok;
      }
      if (tile.feature) return fail('the land must be cleared first');
      if (tile.improvement === imp.id) return fail('already improved');

      const res = tile.resource ? ctx.rules.resources[tile.resource] : null;
      const matchesResource = !!res && res.improvedBy === imp.id;
      if (imp.requiresResource && !matchesResource) return fail('needs a matching resource');
      if (!matchesResource) {
        if (imp.validTerrains && !imp.validTerrains.includes(tile.terrain))
          return fail('wrong terrain for this improvement');
        if (imp.validElevations && !imp.validElevations.includes(tile.elevation))
          return fail('wrong ground for this improvement');
      }
      return ok;
    }

    case 'FORTIFY': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      if (isCivilian(ctx, v.unit)) return fail('civilians cannot fortify');
      if (v.unit.stance === 'fortified') return fail('already fortified');
      return ok;
    }

    case 'SKIP_UNIT':
    case 'DISBAND': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      return ok;
    }

    case 'SET_PRODUCTION': {
      const city = state.cities[action.city];
      if (!city || city.owner !== action.player) return fail('not your city');
      return canProduce(ctx, state, city, action.item);
    }

    case 'BUY_ITEM': {
      const city = state.cities[action.city];
      if (!city || city.owner !== action.player) return fail('not your city');
      const can = canProduce(ctx, state, city, action.item);
      if (!can.ok) return can;
      const price = purchaseCost(ctx, action.item);
      if (state.players[action.player].gold < price)
        return fail(`not enough gold (${price} needed)`);
      return ok;
    }

    case 'SET_RESEARCH': {
      const tech = ctx.rules.techs[action.tech];
      if (!tech) return fail('unknown technology');
      if (player.techs.includes(action.tech)) return fail('already discovered');
      if (!tech.prereqs.every((p) => player.techs.includes(p)))
        return fail('prerequisites not yet discovered');
      return ok;
    }

    case 'DECLARE_WAR': {
      const target = state.players[action.target];
      if (!target || action.target === action.player) return fail('invalid target');
      if (!target.alive) return fail('that empire has fallen');
      if (atWar(state, action.player, action.target)) return fail('already at war');
      return ok;
    }
  }
}

function ownUnit(
  state: GameState,
  player: number,
  unitId: number,
): { unit?: Unit; error?: Validation } {
  const unit = state.units[unitId];
  if (!unit) return { error: fail('no such unit') };
  if (unit.owner !== player) return { error: fail('not your unit') };
  return { unit };
}
