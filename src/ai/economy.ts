/**
 * AI economic judgment: research priorities, city production, settle scoring,
 * worker job selection. All pure functions of (ctx, state, player) — fair
 * (explored knowledge only) and deterministic (sorted iteration, id ties).
 */
import type { AiWeights } from '../data/types';
import type { City, Ctx, GameState, PlayerId, ProductionItem, Unit } from '../engine/types';
import { VIS_UNSEEN, VIS_VISIBLE } from '../engine/types';
import { axialOfIndex, hexDistance, hexesWithin, tileIndex } from '../engine/hex';
import {
  atWar,
  availableTechs,
  canProduce,
  cityDistanceOk,
  empireHappiness,
  hasMet,
  isCivilian,
  isCoastal,
  isImpassable,
  isWater,
  militaryPower,
  playerCities,
  playerUnits,
  tileOwner,
  tileYields,
  traitWeights,
} from '../engine/selectors';
import { validateAction } from '../engine/validate';

const COASTAL_BONUS = 6;

/** Static backbone with situational bumps; first available wins. */
export function pickResearch(ctx: Ctx, state: GameState, pid: PlayerId): { tech: string; reason: string } | null {
  const available = availableTechs(ctx, state, pid);
  if (!available.length) return null;
  const wars = state.players.some((p) => p.alive && atWar(state, pid, p.id));

  const priority = wars
    ? ['archery', 'bronze_working', 'masonry', 'iron_working', 'mathematics', 'pottery', 'mining', 'animal_husbandry', 'writing', 'horseback_riding', 'currency', 'construction', 'philosophy', 'feudalism', 'machinery', 'chivalry', 'engineering', 'gunpowder', 'metallurgy', 'education', 'guilds', 'theology', 'astronomy', 'banking', 'printing_press', 'architecture', 'chemistry', 'scientific_method']
    : ['pottery', 'animal_husbandry', 'mining', 'writing', 'archery', 'bronze_working', 'masonry', 'currency', 'horseback_riding', 'iron_working', 'philosophy', 'theology', 'construction', 'mathematics', 'education', 'feudalism', 'engineering', 'machinery', 'guilds', 'chivalry', 'astronomy', 'banking', 'printing_press', 'gunpowder', 'architecture', 'metallurgy', 'chemistry', 'scientific_method'];

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

/** A settle-site bonus for coastal tiles (they can build ships/harbors). */
function coastalBonus(ctx: Ctx, state: GameState, a: { q: number; r: number }): number {
  return isCoastal(ctx, state, a) ? COASTAL_BONUS : 0;
}
/** Test seam. */
export function coastalBonusForTest(ctx: Ctx, state: GameState, a: { q: number; r: number }): number {
  return coastalBonus(ctx, state, a);
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
    score += coastalBonus(ctx, state, a);
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

function activeTradeCount(ctx: Ctx, state: GameState, pid: PlayerId): number {
  const routes = Object.values(state.tradeRoutes).filter((r) => r.owner === pid).length;
  const caravans = playerUnits(state, pid).filter((u) => ctx.rules.units[u.def].abilities?.includes('trade')).length;
  return routes + caravans;
}

function hasTradeTarget(ctx: Ctx, state: GameState, pid: PlayerId): boolean {
  const range = ctx.rules.settings.tradeRoute.caravanRange;
  const mine = playerCities(state, pid);
  if (mine.length >= 2 && mine.some((a) => mine.some((b) => a.id !== b.id && hexDistance({ q: a.q, r: a.r }, { q: b.q, r: b.r }) <= range)))
    return true;
  for (const p of state.players) {
    if (!p.alive || p.id === pid || !hasMet(state, pid, p.id) || atWar(state, pid, p.id)) continue;
    for (const c of playerCities(state, p.id))
      if (mine.some((o) => hexDistance({ q: o.q, r: o.r }, { q: c.q, r: c.r }) <= range)) return true;
  }
  return false;
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

/** True when a coastal city has a reason to build warships. */
export function navalNeed(ctx: Ctx, state: GameState, city: City): boolean {
  const pid = city.owner;
  if (!isCoastal(ctx, state, city)) return false;
  // an enemy ship we can currently see
  for (const id of Object.keys(state.units).map(Number)) {
    const u = state.units[id];
    if (u.owner === pid || ctx.rules.units[u.def].domain !== 'sea') continue;
    if (!atWar(state, pid, u.owner)) continue;
    const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);
    if (state.visibility[pid][idx] === VIS_VISIBLE) return true;
  }
  // a friendly embarked civilian needing escort
  for (const u of playerUnits(state, pid)) {
    if (!isCivilian(ctx, u)) continue;
    const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);
    if (isWater(ctx, state.tiles[idx].terrain)) return true;
  }
  return false;
}

/** Test seam. */
export function navalNeedForTest(ctx: Ctx, state: GameState, city: City): boolean { return navalNeed(ctx, state, city); }

function bestMilitary(ctx: Ctx, state: GameState, city: City): ProductionItem | null {
  const allowSea = navalNeed(ctx, state, city);
  const ranked = Object.values(ctx.rules.units)
    .filter((u) => u.class !== 'civilian' && (allowSea || u.domain !== 'sea'))
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

const BUILDING_PRIORITY = ['monument', 'shrine', 'granary', 'library', 'walls', 'market', 'harbor', 'workshop', 'factory', 'aqueduct', 'temple', 'colosseum', 'courthouse', 'university', 'observatory', 'bank', 'stock_exchange', 'castle', 'monastery', 'cathedral'];

const FOCUS_BUILDINGS: Record<string, string[]> = {
  faith: ['shrine', 'temple', 'monastery', 'cathedral'],
  science: ['library', 'university', 'observatory'],
  culture: ['monument', 'temple', 'cathedral'],
  gold: ['market', 'bank'],
};
/** BUILDING_PRIORITY with a leader's trait-favored buildings moved to the front (stable otherwise). */
function buildingPriorityFor(tw: Required<AiWeights>): string[] {
  const front: string[] = [];
  for (const k of ['faith', 'science', 'culture', 'gold'] as const)
    if (tw[k] > 0) for (const b of FOCUS_BUILDINGS[k]) if (!front.includes(b)) front.push(b);
  return [...front, ...BUILDING_PRIORITY.filter((b) => !front.includes(b))];
}

/** A coastal city wants a Work Boat if it owns an unimproved fish tile and none is already targeted/here. */
function wantsWorkBoat(ctx: Ctx, state: GameState, city: City): boolean {
  if (!isCoastal(ctx, state, city)) return false;
  if (playerUnits(state, city.owner).some((u) => u.def === 'work_boat')) return false; // one at a time
  for (const h of hexesWithin({ q: city.q, r: city.r }, ctx.rules.settings.workRadius)) {
    const idx = tileIndex(h, state.mapW, state.mapH);
    if (idx < 0) continue;
    const t = state.tiles[idx];
    if (tileOwner(state, idx) !== city.owner) continue;
    if (t.resource && ctx.rules.resources[t.resource]?.improvedBy === 'fishing_boats' && t.improvement !== 'fishing_boats')
      return true;
  }
  return false;
}

/** Test seam. */
export function wantsWorkBoatForTest(ctx: Ctx, state: GameState, city: City): boolean { return wantsWorkBoat(ctx, state, city); }

/** A coastal city wants a galley to chart the seas / find rivals when it owns no warship and rivals are unmet. */
function wantsGalley(ctx: Ctx, state: GameState, city: City): boolean {
  if (!isCoastal(ctx, state, city)) return false;
  const pid = city.owner;
  if (playerCities(state, pid).length < 2) return false; // expand first; explore the seas once established
  if (playerUnits(state, pid).some((u) => ctx.rules.units[u.def].domain === 'sea' && !isCivilian(ctx, u))) return false;
  return state.players.some((p) => p.alive && !p.barbarian && p.id !== pid && !state.relations[pid][p.id].met);
}

export function pickProduction(
  ctx: Ctx,
  state: GameState,
  city: City,
): { item: ProductionItem; reason: string } | null {
  const pid = city.owner;
  const myUnits = playerUnits(state, pid);
  const myCities = playerCities(state, pid);
  const threat = threatNear(ctx, state, city);
  const tw = traitWeights(ctx, state, pid);

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

  // 2d. eyes on the seas: a coastal city builds an early galley to chart the waters and find rivals
  if (wantsGalley(ctx, state, city) && canProduce(ctx, state, city, { kind: 'unit', id: 'galley' }).ok) {
    return { item: { kind: 'unit', id: 'galley' }, reason: 'a galley to chart the seas' };
  }

  // 3. expansion while the land is open
  const settlersAlive = myUnits.filter((u) => ctx.rules.units[u.def].abilities?.includes('foundCity')).length;
  const spots = knownGoodSpots(ctx, state, pid);
  if (
    myCities.length + settlersAlive < desiredCities(state) + tw.expansion &&
    spots.length > 0 &&
    canProduce(ctx, state, city, { kind: 'unit', id: 'settler' }).ok
  ) {
    return {
      item: { kind: 'unit', id: 'settler' },
      reason: `room to grow: ${spots.length} known sites, want ${desiredCities(state) + tw.expansion} cities`,
    };
  }

  // 4. workers to tend the land
  const workers = myUnits.filter((u) => ctx.rules.units[u.def].abilities?.includes('improve')).length;
  if (workers < Math.min(myCities.length, 3) && canProduce(ctx, state, city, { kind: 'unit', id: 'worker' }).ok) {
    return { item: { kind: 'unit', id: 'worker' }, reason: 'fields need hands' };
  }

  // 4a. a coastal city with a fish tile wants a Work Boat
  if (wantsWorkBoat(ctx, state, city) && canProduce(ctx, state, city, { kind: 'unit', id: 'work_boat' }).ok) {
    return { item: { kind: 'unit', id: 'work_boat' }, reason: 'a work boat to harvest the fishery' };
  }

  // 4b. a caravan opens trade income once the homeland is tended
  if (
    ctx.rules.units.caravan &&
    activeTradeCount(ctx, state, pid) < Math.ceil(myCities.length / 2) &&
    hasTradeTarget(ctx, state, pid) &&
    canProduce(ctx, state, city, { kind: 'unit', id: 'caravan' }).ok
  ) {
    return { item: { kind: 'unit', id: 'caravan' }, reason: 'a caravan to open a trade route' };
  }

  // 5. keep pace militarily with known rivals
  const myPower = militaryPower(ctx, state, pid);
  const rivalPower = Math.max(
    0,
    ...state.players.filter((p) => p.alive && p.id !== pid).map((p) => knownPower(ctx, state, pid, p.id)),
  );
  if (myPower < rivalPower * (0.8 + tw.military * 0.1)) {
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
  for (const b of buildingPriorityFor(tw)) {
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

/** Best fishing-boats job for a sea-domain Work Boat: an owned water tile with a matching resource. */
export function bestSeaWorkerJob(ctx: Ctx, state: GameState, worker: Unit): { idx: number; improvement: string } | null {
  const pid = worker.owner;
  let best: { idx: number; dist: number; i: number } | null = null;
  for (const city of playerCities(state, pid)) {
    for (const h of hexesWithin({ q: city.q, r: city.r }, ctx.rules.settings.workRadius)) {
      const idx = tileIndex(h, state.mapW, state.mapH);
      if (idx < 0) continue;
      const t = state.tiles[idx];
      if (!isWater(ctx, t.terrain) || tileOwner(state, idx) !== pid) continue;
      if (!t.resource || ctx.rules.resources[t.resource]?.improvedBy !== 'fishing_boats') continue;
      if (t.improvement === 'fishing_boats') continue;
      const probe = { ...worker, q: h.q, r: h.r };
      const probeState = { ...state, units: { ...state.units, [worker.id]: probe } };
      if (!validateAction(ctx, probeState, { type: 'BUILD_IMPROVEMENT', player: pid, unit: worker.id, improvement: 'fishing_boats' }).ok) continue;
      const dist = hexDistance({ q: worker.q, r: worker.r }, h);
      if (!best || dist < best.dist || (dist === best.dist && idx < best.i)) best = { idx, dist, i: idx };
    }
  }
  return best ? { idx: best.idx, improvement: 'fishing_boats' } : null;
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
