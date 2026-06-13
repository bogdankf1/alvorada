/**
 * Trade routes: a caravan connects two cities. The origin city earns the route
 * yield each turn (through cityYields); the route expires or is pillaged, and
 * war/capture sever it. Pure mutations inside the reducer — replays reproduce them.
 */
import type { Ctx, GameState, PlayerId, TradeRoute, Unit, City } from '../types';
import { sortedIds } from '../types';
import { tileIndex } from '../hex';
import { atWar, isCivilian, tradeOrigin } from '../selectors';
import { findPath } from '../map/pathfind';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';

export function establishTradeRoute(ctx: Ctx, state: GameState, unit: Unit, target: City): void {
  const pid = unit.owner;
  const origin = tradeOrigin(ctx, state, pid, target);
  if (!origin) return; // validation guarantees one; defensive
  const probe: Unit = { ...unit, q: origin.q, r: origin.r };
  const steps = findPath(ctx, state, probe, { q: target.q, r: target.r }) ?? [];
  const path = [
    tileIndex({ q: origin.q, r: origin.r }, state.mapW, state.mapH),
    ...steps.map((a) => tileIndex(a, state.mapW, state.mapH)),
  ];
  const kind: TradeRoute['kind'] = target.owner === pid ? 'domestic' : 'international';
  const route: TradeRoute = {
    id: state.nextTradeRouteId++, owner: pid, fromCity: origin.id, toCity: target.id,
    kind, expires: state.turn + ctx.rules.settings.tradeRoute.duration, path,
  };
  state.tradeRoutes[route.id] = route;
  delete state.units[unit.id];
  recomputeVisibility(ctx, state, pid);
  pushEvent(state, {
    player: pid, type: 'tradeEstablished',
    msg: `Trade route opened from ${origin.name} to ${target.name}`, q: target.q, r: target.r,
  });
}

export function processTradeRoutes(ctx: Ctx, state: GameState, pid: PlayerId): void {
  const bounty = ctx.rules.settings.tradeRoute.pillageBounty;
  for (const id of sortedIds(state.tradeRoutes)) {
    const r = state.tradeRoutes[id];
    if (r.owner !== pid) continue;
    if (state.turn >= r.expires) {
      pushEvent(state, { player: pid, type: 'tradeExpired', msg: 'A trade route has run its course' });
      delete state.tradeRoutes[id];
      continue;
    }
    const onPath = new Set(r.path);
    for (const uid of sortedIds(state.units)) {
      const u = state.units[uid];
      if (u.owner === pid || isCivilian(ctx, u) || !atWar(state, pid, u.owner)) continue;
      if (onPath.has(tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH))) {
        state.players[u.owner].gold += bounty;
        pushEvent(state, { player: pid, type: 'tradePillaged', msg: 'Raiders plundered a trade route', q: u.q, r: u.r });
        pushEvent(state, { player: u.owner, type: 'tradePillaged', msg: `Your forces plundered an enemy trade route (+${bounty} gold)`, q: u.q, r: u.r });
        delete state.tradeRoutes[id];
        break;
      }
    }
  }
}
