/**
 * AI economic judgment: research priorities, city production, settle scoring,
 * worker job selection. All pure functions of (ctx, state, player) — fair
 * (explored knowledge only) and deterministic (sorted iteration, id ties).
 */
import type { City, Ctx, GameState, PlayerId, ProductionItem, Unit } from '../engine/types';
import { VIS_UNSEEN } from '../engine/types';
import { axialOfIndex, hexDistance, hexesWithin, tileIndex } from '../engine/hex';
import {
  atWar,
  availableTechs,
  canProduce,
  cityDistanceOk,
  empireHappiness,
  isCivilian,
  isImpassable,
  isWater,
  militaryPower,
  playerCities,
  playerUnits,
  tileOwner,
  tileYields,
} from '../engine/selectors';
import { validateAction } from '../engine/validate';

/** Static backbone with situational bumps; first available wins. */
export function pickResearch(ctx: Ctx, state: GameState, pid: PlayerId): { tech: string; reason: string } | null {
  const available = availableTechs(ctx, state, pid);
  if (!available.length) return null;
  const wars = state.players.some((p) => p.alive && atWar(state, pid, p.id));

  const priority = wars
    ? ['archery', 'bronze_working', 'masonry', 'iron_working', 'mathematics', 'pottery', 'mining', 'animal_husbandry', 'writing', 'horseback_riding', 'currency', 'construction', 'philosophy', 'feudalism', 'machinery', 'chivalry', 'engineering', 'gunpowder', 'metallurgy', 'education', 'guilds', 'theology', 'astronomy', 'banking', 'printing_press', 'architecture', 'chemistry', 'scientific_method']
    : ['pottery', 'animal_husbandry', 'mining', 'writing', 'archery', 'bronze_working', 'masonry', 'currency', 'horseback_riding', 'iron_working', 'philosophy', 'construction', 'mathematics', 'education', 'feudalism', 'engineering', 'machinery', 'guilds', 'chivalry', 'theology', 'astronomy', 'banking', 'printing_press', 'gunpowder', 'architecture', 'metallurgy', 'chemistry', 'scientific_method'];

  for (const t of priority) {
    if (available.includes(t)) {
      return {
        tech: t,
        reason: wars ? `war footing: ${t} hardens the army` : `economic backbone: ${t} next`,
      };
    }
  }
  return { tech: available[0], reason: 'remaining technology' };
}

export function knownGoodSpots(
  ctx: Ctx,
  state: GameState,
  pid: PlayerId,
): { idx: number; score: number }[] {
  const vis = state.visibility[pid];
  const out: { idx: number; score: number }[] = [];
  for (let idx = 0; idx < state.tiles.length; idx++) {
    if (vis[idx] === VIS_UNSEEN) continue;
    const t = state.tiles[idx];
    if (isWater(ctx, t.terrain) || ctx.rules.elevations[t.elevation].impassable) continue;
    const a = axialOfIndex(idx, state.mapW);
    if (!cityDistanceOk(ctx, state, a)) continue;
    const owner = tileOwner(state, idx);
    if (owner !== null && owner !== pid) continue;
    let score = 0;
    for (const h of hexesWithin(a, 2)) {
      const j = tileIndex(h, state.mapW, state.mapH);
      if (j < 0 || vis[j] === VIS_UNSEEN) continue;
      const y = tileYields(ctx, state, j, pid);
      score += y.food * 3 + y.production * 2 + y.gold;
      if (state.tiles[j].resource) score += 3;
    }
    if (score >= 18) out.push({ idx, score });
  }
  out.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return out.slice(0, 12);
}

export function desiredCities(state: GameState): number {
  // gentle expansion curve: 2 by t30, 3 by t60, 4 by t100
  if (state.turn < 25) return 2;
  if (state.turn < 55) return 3;
  if (state.turn < 95) return 4;
  return 5;
}

function threatNear(ctx: Ctx, state: GameState, city: City): number {
  let threat = 0;
  for (const id of Object.keys(state.units)
    .map(Number)
    .sort((a, b) => a - b)) {
    const u = state.units[id];
    if (u.owner === city.owner || isCivilian(ctx, u)) continue;
    if (!atWar(state, city.owner, u.owner)) continue;
    if (hexDistance({ q: u.q, r: u.r }, { q: city.q, r: city.r }) <= 4) {
      threat += ctx.rules.units[u.def].strength;
    }
  }
  return threat;
}

function hasGarrison(ctx: Ctx, state: GameState, city: City): boolean {
  return playerUnits(state, city.owner).some(
    (u) => !isCivilian(ctx, u) && u.q === city.q && u.r === city.r,
  );
}

function bestMilitary(ctx: Ctx, state: GameState, city: City): ProductionItem | null {
  const ranked = Object.values(ctx.rules.units)
    .filter((u) => u.class !== 'civilian')
    .sort(
      (a, b) =>
        Math.max(b.strength, b.ranged?.strength ?? 0) - Math.max(a.strength, a.ranged?.strength ?? 0) ||
        a.id.localeCompare(b.id),
    );
  for (const def of ranked) {
    const item: ProductionItem = { kind: 'unit', id: def.id };
    if (canProduce(ctx, state, city, item).ok) return item;
  }
  return null;
}

const BUILDING_PRIORITY = ['monument', 'granary', 'library', 'walls', 'market', 'workshop', 'aqueduct', 'temple', 'colosseum', 'courthouse', 'university', 'observatory', 'bank', 'castle', 'monastery', 'cathedral'];

export function pickProduction(
  ctx: Ctx,
  state: GameState,
  city: City,
): { item: ProductionItem; reason: string } | null {
  const pid = city.owner;
  const myUnits = playerUnits(state, pid);
  const myCities = playerCities(state, pid);
  const threat = threatNear(ctx, state, city);

  // 1. an undefended city arms itself first
  if (!hasGarrison(ctx, state, city) && !myUnits.some((u) => !isCivilian(ctx, u) && hexDistance({ q: u.q, r: u.r }, { q: city.q, r: city.r }) <= 2)) {
    const mil = bestMilitary(ctx, state, city);
    if (mil) return { item: mil, reason: `${city.name} is undefended` };
  }

  // 2. under threat: more soldiers
  if (threat > 0) {
    const mil = bestMilitary(ctx, state, city);
    if (mil) return { item: mil, reason: `enemies near ${city.name} (threat ${threat})` };
  }

  // 2b. an unhappy empire quells unrest before anything optional
  if (empireHappiness(ctx, state, pid).net < 0) {
    if (city.occupied && canProduce(ctx, state, city, { kind: 'building', id: 'courthouse' }).ok)
      return { item: { kind: 'building', id: 'courthouse' }, reason: `${city.name} seethes under occupation` };
    if (canProduce(ctx, state, city, { kind: 'building', id: 'colosseum' }).ok)
      return { item: { kind: 'building', id: 'colosseum' }, reason: 'the people demand bread and circuses' };
  }

  // 2c. eyes on the world: one early scout per empire
  if (
    state.turn <= 40 &&
    ctx.rules.units.scout &&
    !myUnits.some((u) => u.def === 'scout') &&
    canProduce(ctx, state, city, { kind: 'unit', id: 'scout' }).ok
  ) {
    return { item: { kind: 'unit', id: 'scout' }, reason: 'the world is unmapped' };
  }

  // 3. expansion while the land is open
  const settlersAlive = myUnits.filter((u) => ctx.rules.units[u.def].abilities?.includes('foundCity')).length;
  const spots = knownGoodSpots(ctx, state, pid);
  if (
    myCities.length + settlersAlive < desiredCities(state) &&
    spots.length > 0 &&
    canProduce(ctx, state, city, { kind: 'unit', id: 'settler' }).ok
  ) {
    return {
      item: { kind: 'unit', id: 'settler' },
      reason: `room to grow: ${spots.length} known sites, want ${desiredCities(state)} cities`,
    };
  }

  // 4. workers to tend the land
  const workers = myUnits.filter((u) => ctx.rules.units[u.def].abilities?.includes('improve')).length;
  if (workers < Math.min(myCities.length, 3) && canProduce(ctx, state, city, { kind: 'unit', id: 'worker' }).ok) {
    return { item: { kind: 'unit', id: 'worker' }, reason: 'fields need hands' };
  }

  // 5. keep pace militarily with known rivals
  const myPower = militaryPower(ctx, state, pid);
  const rivalPower = Math.max(
    0,
    ...state.players.filter((p) => p.alive && p.id !== pid).map((p) => knownPower(ctx, state, pid, p.id)),
  );
  if (myPower < rivalPower * 0.8) {
    const mil = bestMilitary(ctx, state, city);
    if (mil) return { item: mil, reason: `army lags rivals (${myPower} vs ~${rivalPower})` };
  }

  // 5b. wars we are in, or wars we intend: build the host
  const atWarNow = state.players.some((p) => p.alive && atWar(state, pid, p.id));
  if (atWarNow && myPower < rivalPower * 2) {
    const mil = bestMilitary(ctx, state, city);
    if (mil) return { item: mil, reason: 'the war must be fed' };
  }
  if (!atWarNow && spots.length === 0 && state.turn > 40 && rivalPower > 0 && myPower < rivalPower * 1.7) {
    const mil = bestMilitary(ctx, state, city);
    if (mil)
      return {
        item: mil,
        reason: `no land left to settle — preparing for conquest (${myPower}/${Math.ceil(rivalPower * 1.7)})`,
      };
  }

  // 6. wonders: when safe, claim an available world wonder (high, lasting value)
  if (threat === 0) {
    const wonder = Object.values(ctx.rules.buildings)
      .filter((b) => b.wonder && canProduce(ctx, state, city, { kind: 'building', id: b.id }).ok)
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
    if (wonder) return { item: { kind: 'building', id: wonder.id }, reason: `building ${wonder.name}` };
  }

  // 7. civic buildings in priority order
  for (const b of BUILDING_PRIORITY) {
    const item: ProductionItem = { kind: 'building', id: b };
    if (canProduce(ctx, state, city, item).ok) {
      return { item, reason: `civic works: ${b}` };
    }
  }

  // 8. fallback: any military
  const mil = bestMilitary(ctx, state, city);
  if (mil) return { item: mil, reason: 'nothing better than soldiers' };
  return null;
}

/** Power the player can SEE (fair): visible units + a base guess per known city. */
export function knownPower(ctx: Ctx, state: GameState, viewer: PlayerId, target: PlayerId): number {
  const vis = state.visibility[viewer];
  let power = 0;
  for (const u of playerUnits(state, target)) {
    const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);
    if (vis[idx] === 2 && !isCivilian(ctx, u)) {
      const def = ctx.rules.units[u.def];
      power += Math.max(def.strength, def.ranged?.strength ?? 0);
    }
  }
  for (const c of playerCities(state, target)) {
    const idx = tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH);
    if (vis[idx] !== VIS_UNSEEN) power += 10; // assume a garrison behind every known wall
  }
  return power;
}

/** Best improvement job on owned tiles near our cities; returns build target. */
export function bestWorkerJob(
  ctx: Ctx,
  state: GameState,
  worker: Unit,
): { idx: number; improvement: string; value: number } | null {
  const pid = worker.owner;
  let best: { idx: number; improvement: string; value: number; dist: number } | null = null;
  for (const city of playerCities(state, pid)) {
    for (const h of hexesWithin({ q: city.q, r: city.r }, ctx.rules.settings.workRadius)) {
      const idx = tileIndex(h, state.mapW, state.mapH);
      if (idx < 0) continue;
      const tile = state.tiles[idx];
      if (tile.ownerCity === null || tileOwner(state, idx) !== pid) continue;
      if (isImpassable(ctx, state, idx)) continue;
      for (const imp of Object.keys(ctx.rules.improvements).sort()) {
        const probe = { ...worker, q: h.q, r: h.r };
        const probeState = { ...state, units: { ...state.units, [worker.id]: probe } };
        const v = validateAction(ctx, probeState, {
          type: 'BUILD_IMPROVEMENT',
          player: pid,
          unit: worker.id,
          improvement: imp,
        });
        if (!v.ok) continue;
        const def = ctx.rules.improvements[imp];
        let value = (def.yields.food ?? 0) * 3 + (def.yields.production ?? 0) * 2 + (def.yields.gold ?? 0);
        if (tile.resource && ctx.rules.resources[tile.resource].improvedBy === imp) {
          value += 6;
          if (ctx.rules.resources[tile.resource].kind === 'luxury') value += 8; // connecting a luxury relieves unhappiness
        }
        if (def.clearsFeature) value = 1; // chop only when nothing else remains
        const dist = hexDistance({ q: worker.q, r: worker.r }, h);
        if (
          !best ||
          value > best.value ||
          (value === best.value && dist < best.dist) ||
          (value === best.value && dist === best.dist && idx < best.idx)
        ) {
          best = { idx, improvement: imp, value, dist };
        }
      }
    }
  }
  return best;
}
