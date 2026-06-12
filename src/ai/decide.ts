/**
 * The AI: a pure function (state, player) -> one explainable action.
 * The driver calls it repeatedly until it returns END_TURN. It plays by the
 * exact rules a human does — same actions, same validation, same fog.
 */
import type { Action, Axial, City, Ctx, GameState, PlayerId, Unit } from '../engine/types';
import { VIS_UNSEEN, VIS_VISIBLE } from '../engine/types';
import { axialOfIndex, hexDistance, hexesWithin, neighbors, tileIndex } from '../engine/hex';
import {
  atWar,
  cityAt,
  cityDistanceOk,
  isCivilian,
  militaryAt,
  militaryPower,
  playerCities,
  playerUnits,
} from '../engine/selectors';
import { validateAction } from '../engine/validate';
import { findPath } from '../engine/map/pathfind';
import { cityStrength } from '../engine/systems/combat';
import { bestWorkerJob, knownGoodSpots, knownPower, pickProduction, pickResearch } from './economy';

export interface AiDecision {
  action: Action;
  reason: string;
}

export function decide(ctx: Ctx, state: GameState, pid: PlayerId): AiDecision {
  const endTurn: AiDecision = {
    action: { type: 'END_TURN', player: pid },
    reason: 'orders issued',
  };
  if (state.phase === 'ended') return endTurn;

  const tryDecision = (d: AiDecision | null): AiDecision | null =>
    d && validateAction(ctx, state, d.action).ok ? d : null;

  // 1. research
  if (!state.players[pid].researching) {
    const pick = pickResearch(ctx, state, pid);
    if (pick) {
      const d = tryDecision({
        action: { type: 'SET_RESEARCH', player: pid, tech: pick.tech },
        reason: pick.reason,
      });
      if (d) return d;
    }
  }

  // 2. idle cities choose production
  for (const city of playerCities(state, pid)) {
    if (city.production.item) continue;
    const pick = pickProduction(ctx, state, city);
    if (pick) {
      const d = tryDecision({
        action: { type: 'SET_PRODUCTION', player: pid, city: city.id, item: pick.item },
        reason: `${city.name}: ${pick.reason}`,
      });
      if (d) return d;
    }
  }

  // 3. consider war
  const war = considerWar(ctx, state, pid);
  if (war) {
    const d = tryDecision(war);
    if (d) return d;
  }

  // 4. units act one at a time
  const anyWar = state.players.some((p) => p.alive && atWar(state, pid, p.id));
  for (const unit of playerUnits(state, pid)) {
    if (unit.moves <= 0 || unit.order) continue;
    if (unit.stance === 'fortified' && !anyWar) continue; // posted sentries stay posted
    const d = decideUnit(ctx, state, unit);
    const valid = tryDecision(d);
    if (valid) return valid;
    // nothing sensible: stand down so the turn can end
    const fallback: Action = isCivilian(ctx, unit)
      ? { type: 'SKIP_UNIT', player: pid, unit: unit.id }
      : unit.stance !== 'fortified'
        ? { type: 'FORTIFY', player: pid, unit: unit.id }
        : { type: 'SKIP_UNIT', player: pid, unit: unit.id };
    const f = tryDecision({ action: fallback, reason: 'no useful orders; standing by' });
    if (f) return f;
  }

  return endTurn;
}

// --- war counsel ---

function considerWar(ctx: Ctx, state: GameState, pid: PlayerId): AiDecision | null {
  if (state.turn < 30) return null;
  const myPower = militaryPower(ctx, state, pid);
  const myCapital = playerCities(state, pid)[0];
  if (!myCapital || myPower < 30) return null;

  for (const rival of state.players) {
    if (!rival.alive || rival.id === pid || atWar(state, pid, rival.id)) continue;
    const theirPower = knownPower(ctx, state, pid, rival.id);
    const theirCities = playerCities(state, rival.id).filter((c) => {
      const idx = tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH);
      return state.visibility[pid][idx] !== VIS_UNSEEN;
    });
    if (!theirCities.length) continue;
    const nearest = Math.min(
      ...theirCities.map((c) => hexDistance({ q: c.q, r: c.r }, { q: myCapital.q, r: myCapital.r })),
    );
    if (myPower >= theirPower * 1.5 && nearest <= 14) {
      return {
        action: { type: 'DECLARE_WAR', player: pid, target: rival.id },
        reason: `war on ${rival.name}: power ${myPower} vs ~${theirPower}, marches ${nearest} tiles`,
      };
    }
  }
  return null;
}

// --- unit orders ---

function decideUnit(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const def = ctx.rules.units[unit.def];
  if (def.abilities?.includes('foundCity')) return decideSettler(ctx, state, unit);
  if (def.abilities?.includes('improve')) return decideWorker(ctx, state, unit);
  if (unit.def === 'scout') return decideScout(ctx, state, unit) ?? decideMilitary(ctx, state, unit);
  return decideMilitary(ctx, state, unit);
}

function moveAlong(ctx: Ctx, state: GameState, unit: Unit, dest: Axial, reason: string): AiDecision | null {
  const path = findPath(ctx, state, unit, dest);
  if (!path || !path.length) return null;
  return {
    action: { type: 'MOVE_UNIT', player: unit.owner, unit: unit.id, path },
    reason,
  };
}

function decideSettler(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const pid = unit.owner;
  const spots = knownGoodSpots(ctx, state, pid);
  const here = tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH);

  const canFoundHere =
    cityDistanceOk(ctx, state, { q: unit.q, r: unit.r }) &&
    validateAction(ctx, state, { type: 'FOUND_CITY', player: pid, unit: unit.id }).ok;
  const hereScore = spots.find((s) => s.idx === here)?.score ?? 0;
  const best = spots[0];

  // settle when standing on a spot nearly as good as the best known
  if (canFoundHere && (hereScore >= (best?.score ?? 0) * 0.9 || !best)) {
    return {
      action: { type: 'FOUND_CITY', player: pid, unit: unit.id },
      reason: `founding here (site score ${hereScore})`,
    };
  }
  if (best) {
    const dest = axialOfIndex(best.idx, state.mapW);
    const d = moveAlong(ctx, state, unit, dest, `settler heads to a valley scored ${best.score}`);
    if (d) return d;
  }
  // nowhere to settle: found in place if legal at all
  if (canFoundHere) {
    return {
      action: { type: 'FOUND_CITY', player: pid, unit: unit.id },
      reason: 'no better site known; founding here',
    };
  }
  return null;
}

function decideWorker(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const job = bestWorkerJob(ctx, state, unit);
  if (!job) return null;
  const target = axialOfIndex(job.idx, state.mapW);
  if (unit.q === target.q && unit.r === target.r) {
    return {
      action: {
        type: 'BUILD_IMPROVEMENT',
        player: unit.owner,
        unit: unit.id,
        improvement: job.improvement,
      },
      reason: `building ${job.improvement} (value ${job.value})`,
    };
  }
  return moveAlong(ctx, state, unit, target, `worker walks to a ${job.improvement} site`);
}

function decideScout(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const pid = unit.owner;
  const vis = state.visibility[pid];
  // nearest explored tile adjacent to the unknown
  let best: { a: Axial; dist: number; idx: number } | null = null;
  for (let idx = 0; idx < state.tiles.length; idx++) {
    if (vis[idx] === VIS_UNSEEN) continue;
    const a = axialOfIndex(idx, state.mapW);
    const touchesUnknown = neighbors(a).some((nb) => {
      const j = tileIndex(nb, state.mapW, state.mapH);
      return j >= 0 && vis[j] === VIS_UNSEEN;
    });
    if (!touchesUnknown) continue;
    const dist = hexDistance(a, { q: unit.q, r: unit.r });
    if (dist === 0) continue;
    if (!best || dist < best.dist || (dist === best.dist && idx < best.idx)) {
      best = { a, dist, idx };
    }
  }
  if (!best) return null;
  return moveAlong(ctx, state, unit, best.a, `scouting the frontier at distance ${best.dist}`);
}

function decideMilitary(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const pid = unit.owner;
  const def = ctx.rules.units[unit.def];
  const here = { q: unit.q, r: unit.r };

  // 4a. shoot what's in range
  if (def.ranged) {
    let target: { a: Axial; label: string; priority: number } | null = null;
    for (const h of hexesWithin(here, def.ranged.range)) {
      const idx = tileIndex(h, state.mapW, state.mapH);
      if (idx < 0 || state.visibility[pid][idx] !== VIS_VISIBLE) continue;
      const city = cityAt(state, h);
      if (city && atWar(state, pid, city.owner)) {
        const pr = 100 + (300 - city.hp);
        if (!target || pr > target.priority) target = { a: h, label: city.name, priority: pr };
      }
      const enemy = militaryAt(ctx, state, h);
      if (enemy && atWar(state, pid, enemy.owner)) {
        const pr = 200 - enemy.hp;
        if (!target || pr > target.priority)
          target = { a: h, label: ctx.rules.units[enemy.def].name, priority: pr };
      }
    }
    if (target) {
      return {
        action: { type: 'RANGED_ATTACK', player: pid, unit: unit.id, target: target.a },
        reason: `bombarding ${target.label}`,
      };
    }
  } else {
    // 4b. melee: storm an adjacent city, else hit the weakest adjacent enemy
    let bestCity: City | null = null;
    let bestEnemy: Unit | null = null;
    for (const nb of neighbors(here)) {
      const city = cityAt(state, nb);
      if (city && atWar(state, pid, city.owner) && (!bestCity || city.hp < bestCity.hp)) bestCity = city;
      const enemy = militaryAt(ctx, state, nb);
      if (enemy && atWar(state, pid, enemy.owner) && (!bestEnemy || enemy.hp < bestEnemy.hp))
        bestEnemy = enemy;
    }
    if (bestCity && (unit.hp >= 40 || bestCity.hp <= 40)) {
      return {
        action: { type: 'ATTACK', player: pid, unit: unit.id, target: { q: bestCity.q, r: bestCity.r } },
        reason: `storming ${bestCity.name} (city hp ${bestCity.hp})`,
      };
    }
    if (bestEnemy) {
      return {
        action: {
          type: 'ATTACK',
          player: pid,
          unit: unit.id,
          target: { q: bestEnemy.q, r: bestEnemy.r },
        },
        reason: `engaging ${ctx.rules.units[bestEnemy.def].name} (hp ${bestEnemy.hp})`,
      };
    }
  }

  // 4c. campaign: gather, then march on the nearest known enemy city
  const campaign = campaignOrders(ctx, state, unit);
  if (campaign) return campaign;

  // 4d. garrison duty
  const myCities = playerCities(state, pid);
  const unguarded = myCities
    .filter((c) => !militaryAt(ctx, state, { q: c.q, r: c.r }))
    .sort(
      (a, b) =>
        hexDistance({ q: a.q, r: a.r }, here) - hexDistance({ q: b.q, r: b.r }, here) || a.id - b.id,
    );
  if (unguarded.length) {
    const c = unguarded[0];
    if (c.q === unit.q && c.r === unit.r) {
      return unit.stance === 'fortified'
        ? null
        : {
            action: { type: 'FORTIFY', player: pid, unit: unit.id },
            reason: `garrisoning ${c.name}`,
          };
    }
    return moveAlong(ctx, state, unit, { q: c.q, r: c.r }, `marching to garrison ${c.name}`);
  }

  // 4e. peacetime, every city guarded: spare soldiers chart the world
  const anyWar = state.players.some((p) => p.alive && atWar(state, pid, p.id));
  if (!anyWar && state.turn < 70) {
    const explore = decideScout(ctx, state, unit);
    if (explore) return explore;
  }

  return null;
}

/** At war: mass at the staging city until strong enough, then take the field. */
function campaignOrders(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const pid = unit.owner;
  const enemies = state.players.filter((p) => p.alive && atWar(state, pid, p.id));
  if (!enemies.length) return null;

  // nearest known enemy city to our capital
  const myCities = playerCities(state, pid);
  if (!myCities.length) return null;
  const capital = myCities[0];
  let target: City | null = null;
  let targetDist = Infinity;
  for (const e of enemies) {
    for (const c of playerCities(state, e.id)) {
      const idx = tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH);
      if (state.visibility[pid][idx] === VIS_UNSEEN) continue;
      const d = hexDistance({ q: c.q, r: c.r }, { q: capital.q, r: capital.r });
      if (d < targetDist || (d === targetDist && target && c.id < target.id)) {
        target = c;
        targetDist = d;
      }
    }
  }
  if (!target) return null;

  // staging city: ours nearest to the target
  const staging = [...myCities].sort(
    (a, b) =>
      hexDistance({ q: a.q, r: a.r }, { q: target.q, r: target.r }) -
        hexDistance({ q: b.q, r: b.r }, { q: target.q, r: target.r }) || a.id - b.id,
  )[0];

  // force gathered near staging vs what the city needs
  const gathered = playerUnits(state, pid).filter(
    (u) =>
      !isCivilian(ctx, u) &&
      hexDistance({ q: u.q, r: u.r }, { q: staging.q, r: staging.r }) <= 3,
  );
  const gatheredStrength = gathered.reduce((s, u) => {
    const d = ctx.rules.units[u.def];
    return s + Math.max(d.strength, d.ranged?.strength ?? 0);
  }, 0);
  const needed = cityStrength(ctx, state, target) * 2;

  const unitNear = hexDistance({ q: unit.q, r: unit.r }, { q: staging.q, r: staging.r }) <= 3;
  if (gatheredStrength >= needed) {
    // advance on the target
    const ringSpots = hexesWithin({ q: target.q, r: target.r }, 1).filter((h) => !(h.q === target.q && h.r === target.r));
    for (const h of ringSpots) {
      const idx = tileIndex(h, state.mapW, state.mapH);
      if (idx < 0) continue;
      const d = moveAlong(ctx, state, unit, h, `advancing on ${target.name}`);
      if (d) return d;
    }
    return moveAlong(ctx, state, unit, { q: target.q, r: target.r }, `advancing on ${target.name}`);
  }
  if (!unitNear) {
    return moveAlong(
      ctx,
      state,
      unit,
      { q: staging.q, r: staging.r },
      `massing at ${staging.name} (${gatheredStrength}/${needed})`,
    );
  }
  // wait at the muster: fortify
  return unit.stance === 'fortified'
    ? null
    : {
        action: { type: 'FORTIFY', player: pid, unit: unit.id },
        reason: `holding at ${staging.name} until the host is ready`,
      };
}
