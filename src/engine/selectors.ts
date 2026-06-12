/**
 * Pure read-model over GameState. The single source of truth for derived
 * facts — validation, the reducer, the AI, and the UI all ask these same
 * questions, which is what keeps their answers consistent.
 */
import type { Yields } from '../data/types';
import { addYields, emptyYields } from '../data/types';
import type { Axial, City, Ctx, GameState, PlayerId, ProductionItem, Unit } from './types';
import { sortedIds } from './types';
import { hexDistance, hexesWithin, tileIndex } from './hex';

// --- basic lookups ---

export function tileAtIndex(state: GameState, idx: number) {
  return state.tiles[idx];
}

export function tileAt(state: GameState, a: Axial) {
  const idx = tileIndex(a, state.mapW, state.mapH);
  return idx >= 0 ? state.tiles[idx] : null;
}

export function unitsAt(state: GameState, a: Axial): Unit[] {
  const out: Unit[] = [];
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.q === a.q && u.r === a.r) out.push(u);
  }
  return out;
}

export function isCivilian(ctx: Ctx, u: Unit): boolean {
  return ctx.rules.units[u.def].class === 'civilian';
}

export function militaryAt(ctx: Ctx, state: GameState, a: Axial): Unit | undefined {
  return unitsAt(state, a).find((u) => !isCivilian(ctx, u));
}

export function civilianAt(ctx: Ctx, state: GameState, a: Axial): Unit | undefined {
  return unitsAt(state, a).find((u) => isCivilian(ctx, u));
}

export function cityAt(state: GameState, a: Axial): City | undefined {
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (c.q === a.q && c.r === a.r) return c;
  }
  return undefined;
}

export function playerUnits(state: GameState, pid: PlayerId): Unit[] {
  return sortedIds(state.units)
    .map((id) => state.units[id])
    .filter((u) => u.owner === pid);
}

export function playerCities(state: GameState, pid: PlayerId): City[] {
  return sortedIds(state.cities)
    .map((id) => state.cities[id])
    .filter((c) => c.owner === pid);
}

export function atWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return a !== b && state.relations[a][b] === 'war';
}

export function tileOwner(state: GameState, idx: number): PlayerId | null {
  const cityId = state.tiles[idx].ownerCity;
  return cityId === null ? null : (state.cities[cityId]?.owner ?? null);
}

// --- terrain properties ---

export function isWater(ctx: Ctx, terrain: string): boolean {
  return !!ctx.rules.terrains[terrain].water;
}

export function isImpassable(ctx: Ctx, state: GameState, idx: number): boolean {
  const t = state.tiles[idx];
  return !!ctx.rules.elevations[t.elevation].impassable || isWater(ctx, t.terrain);
}

export function moveCostOf(ctx: Ctx, state: GameState, idx: number): number {
  const t = state.tiles[idx];
  const terr = ctx.rules.terrains[t.terrain];
  const elev = ctx.rules.elevations[t.elevation];
  const feat = t.feature ? ctx.rules.features[t.feature] : null;
  return Math.max(1, terr.moveCost + elev.moveCostDelta + (feat?.moveCostDelta ?? 0));
}

export function defenseBonusAt(ctx: Ctx, state: GameState, idx: number): number {
  const t = state.tiles[idx];
  return (
    ctx.rules.terrains[t.terrain].defenseBonus +
    ctx.rules.elevations[t.elevation].defenseBonus +
    (t.feature ? ctx.rules.features[t.feature].defenseBonus : 0)
  );
}

// --- yields ---

/** Yields of one tile as seen/worked by `forPlayer` (resource gated by reveal tech). */
export function tileYields(ctx: Ctx, state: GameState, idx: number, forPlayer: PlayerId): Yields {
  const t = state.tiles[idx];
  const out = emptyYields();
  addYields(out, ctx.rules.terrains[t.terrain].yields);
  addYields(out, ctx.rules.elevations[t.elevation].yields);
  if (t.feature) addYields(out, ctx.rules.features[t.feature].yields);
  if (t.improvement) addYields(out, ctx.rules.improvements[t.improvement].yields);
  if (t.resource) {
    const res = ctx.rules.resources[t.resource];
    if (resourceRevealed(ctx, state, forPlayer, t.resource)) {
      addYields(out, res.yields);
      if (t.improvement && res.improvedBy === t.improvement) addYields(out, res.bonusImproved);
    }
  }
  return out;
}

export function resourceRevealed(
  ctx: Ctx,
  state: GameState,
  player: PlayerId,
  resourceId: string,
): boolean {
  const res = ctx.rules.resources[resourceId];
  return !res.revealedBy || state.players[player].techs.includes(res.revealedBy);
}

/** Deterministic auto-assignment: the city's pop works its best owned tiles. */
export function assignWorkedTiles(ctx: Ctx, state: GameState, city: City): number[] {
  const centerIdx = tileIndex({ q: city.q, r: city.r }, state.mapW, state.mapH);
  const candidates: { idx: number; value: number }[] = [];
  for (const h of hexesWithin({ q: city.q, r: city.r }, ctx.rules.settings.workRadius)) {
    const idx = tileIndex(h, state.mapW, state.mapH);
    if (idx < 0 || idx === centerIdx) continue;
    if (state.tiles[idx].ownerCity !== city.id) continue;
    if (ctx.rules.elevations[state.tiles[idx].elevation].impassable) continue;
    const y = tileYields(ctx, state, idx, city.owner);
    candidates.push({
      idx,
      value: y.food * 4 + y.production * 3 + y.gold * 2 + y.science * 2 + y.culture,
    });
  }
  candidates.sort((a, b) => b.value - a.value || a.idx - b.idx);
  return candidates.slice(0, city.pop).map((c) => c.idx);
}

export interface CityYieldBreakdown {
  total: Yields;
  worked: number[];
}

export function cityYields(ctx: Ctx, state: GameState, city: City): CityYieldBreakdown {
  const s = ctx.rules.settings;
  const total = emptyYields();

  // center tile (never below the settlement minimum)
  const centerIdx = tileIndex({ q: city.q, r: city.r }, state.mapW, state.mapH);
  const center = tileYields(ctx, state, centerIdx, city.owner);
  center.food = Math.max(center.food, 2);
  center.production = Math.max(center.production, 1);
  addYields(total, center);

  const worked = assignWorkedTiles(ctx, state, city);
  for (const idx of worked) addYields(total, tileYields(ctx, state, idx, city.owner));

  for (const b of city.buildings) {
    const def = ctx.rules.buildings[b];
    addYields(total, def.yields);
    if (def.perPop) total[def.perPop.yield] += Math.floor(city.pop / def.perPop.per);
  }
  if (s.sciencePerPopHalf) total.science += Math.floor(city.pop / 2);
  return { total, worked };
}

export function growthThreshold(pop: number): number {
  const p = pop - 1;
  return 15 + 8 * p + Math.floor(p * Math.sqrt(p));
}

export function borderThreshold(ctx: Ctx, tilesClaimed: number): number {
  const g = ctx.rules.settings.borderGrowth;
  return g.base + g.linear * tilesClaimed + g.quad * tilesClaimed * tilesClaimed;
}

// --- production / research gating ---

/** Net strategic resource pool: improved owned sources minus living consumers. */
export function strategicAvailability(
  ctx: Ctx,
  state: GameState,
  pid: PlayerId,
  resourceId: string,
): number {
  let sources = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.resource !== resourceId) continue;
    if (tileOwner(state, i) !== pid) continue;
    const res = ctx.rules.resources[resourceId];
    if (t.improvement && t.improvement === res.improvedBy) sources++;
  }
  let used = 0;
  for (const u of playerUnits(state, pid)) {
    if (ctx.rules.units[u.def].requiresResource === resourceId) used++;
  }
  return sources - used;
}

export function canProduce(
  ctx: Ctx,
  state: GameState,
  city: City,
  item: ProductionItem,
): { ok: true } | { ok: false; reason: string } {
  const player = state.players[city.owner];
  if (item.kind === 'unit') {
    const def = ctx.rules.units[item.id];
    if (!def) return { ok: false, reason: 'unknown unit' };
    if (def.requiresTech && !player.techs.includes(def.requiresTech))
      return { ok: false, reason: `requires ${ctx.rules.techs[def.requiresTech].name}` };
    if (def.requiresResource && strategicAvailability(ctx, state, city.owner, def.requiresResource) <= 0)
      return { ok: false, reason: `requires ${ctx.rules.resources[def.requiresResource].name}` };
    if (def.abilities?.includes('foundCity') && city.pop < 2)
      return { ok: false, reason: 'city too small (needs population 2)' };
    return { ok: true };
  }
  const def = ctx.rules.buildings[item.id];
  if (!def) return { ok: false, reason: 'unknown building' };
  if (def.unbuildable) return { ok: false, reason: 'cannot be built' };
  if (city.buildings.includes(item.id)) return { ok: false, reason: 'already built' };
  if (def.requiresTech && !player.techs.includes(def.requiresTech))
    return { ok: false, reason: `requires ${ctx.rules.techs[def.requiresTech].name}` };
  return { ok: true };
}

export function productionOptions(ctx: Ctx, state: GameState, city: City): ProductionItem[] {
  const out: ProductionItem[] = [];
  for (const id of Object.keys(ctx.rules.units).sort()) {
    if (canProduce(ctx, state, city, { kind: 'unit', id }).ok) out.push({ kind: 'unit', id });
  }
  for (const id of Object.keys(ctx.rules.buildings).sort()) {
    if (canProduce(ctx, state, city, { kind: 'building', id }).ok)
      out.push({ kind: 'building', id });
  }
  return out;
}

export function itemCost(ctx: Ctx, item: ProductionItem): number {
  return item.kind === 'unit' ? ctx.rules.units[item.id].cost : ctx.rules.buildings[item.id].cost;
}

export function purchaseCost(ctx: Ctx, item: ProductionItem): number {
  return itemCost(ctx, item) * ctx.rules.settings.purchaseMultiplier;
}

export function availableTechs(ctx: Ctx, state: GameState, pid: PlayerId): string[] {
  const player = state.players[pid];
  return Object.keys(ctx.rules.techs)
    .sort()
    .filter(
      (id) =>
        !player.techs.includes(id) &&
        ctx.rules.techs[id].prereqs.every((p) => player.techs.includes(p)),
    );
}

// --- misc ---

export function cityDistanceOk(ctx: Ctx, state: GameState, a: Axial): boolean {
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (hexDistance(a, { q: c.q, r: c.r }) < ctx.rules.settings.cityMinDist) return false;
  }
  return true;
}

export function militaryPower(ctx: Ctx, state: GameState, pid: PlayerId): number {
  let power = 0;
  for (const u of playerUnits(state, pid)) {
    const def = ctx.rules.units[u.def];
    power += Math.max(def.strength, def.ranged?.strength ?? 0);
  }
  return power;
}

export function computeScore(ctx: Ctx, state: GameState, pid: PlayerId): number {
  const w = ctx.rules.settings.score;
  const cities = playerCities(state, pid);
  const pop = cities.reduce((s, c) => s + c.pop, 0);
  const techs = state.players[pid].techs.length;
  return (
    cities.length * w.city +
    pop * w.pop +
    techs * w.tech +
    Math.floor(militaryPower(ctx, state, pid) / w.strengthPer)
  );
}

export function currentEra(ctx: Ctx, state: GameState, pid: PlayerId): string {
  const eras = ctx.rules.eras;
  let best = 0;
  for (const t of state.players[pid].techs) {
    const era = ctx.rules.techs[t]?.era;
    const i = eras.findIndex((e) => e.id === era);
    if (i > best) best = i;
  }
  return eras[best].id;
}
