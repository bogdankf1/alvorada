/**
 * City lifecycle: founding, per-turn economy (production, growth, culture
 * borders, regen), unit spawning, and capture.
 */
import type { City, Ctx, GameState, PlayerId, Unit } from '../types';
import { sortedIds } from '../types';
import { axialOfIndex, hexDistance, hexesWithin, ring, tileIndex } from '../hex';
import {
  borderThreshold,
  cityYields,
  civilianAt,
  growthThreshold,
  isCivilian,
  isImpassable,
  itemCost,
  militaryAt,
  tileYields,
} from '../selectors';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';
import { captureCivilian } from './movement';

export function nextCityName(ctx: Ctx, state: GameState, pid: PlayerId): string {
  const player = state.players[pid];
  const names = ctx.rules.civs[player.civ].cityNames;
  const i = player.nextCityName++;
  const base = names[i % names.length];
  const round = Math.floor(i / names.length);
  return round === 0 ? base : `${base} ${'I'.repeat(round + 1).replace('IIII', 'IV')}`;
}

export function foundCity(ctx: Ctx, state: GameState, settler: Unit): City {
  const pid = settler.owner;
  const isFirst = sortedIds(state.cities).every((id) => state.cities[id].owner !== pid);
  const city: City = {
    id: state.nextCityId++,
    owner: pid,
    name: nextCityName(ctx, state, pid),
    q: settler.q,
    r: settler.r,
    pop: 1,
    food: 0,
    production: { item: null, progress: 0 },
    buildings: isFirst
      ? Object.values(ctx.rules.buildings)
          .filter((b) => b.unbuildable)
          .map((b) => b.id)
      : [],
    culture: 0,
    tilesClaimed: 0,
    hp: ctx.rules.settings.cityMaxHp,
  };
  state.cities[city.id] = city;

  for (const h of hexesWithin({ q: city.q, r: city.r }, 1)) {
    const idx = tileIndex(h, state.mapW, state.mapH);
    if (idx >= 0 && state.tiles[idx].ownerCity === null) state.tiles[idx].ownerCity = city.id;
  }
  delete state.units[settler.id];
  recomputeVisibility(ctx, state, pid);
  pushEvent(state, {
    player: null,
    type: 'cityFounded',
    msg: `${state.players[pid].name} founded ${city.name}`,
    q: city.q,
    r: city.r,
  });
  return city;
}

/** Spawn a produced/purchased unit on the city tile or the nearest free ring tile. */
export function placeProducedUnit(ctx: Ctx, state: GameState, city: City, defId: string): Unit | null {
  const def = ctx.rules.units[defId];
  const civilian = def.class === 'civilian';
  const center = { q: city.q, r: city.r };
  const candidates = [center, ...ring(center, 1), ...ring(center, 2)];
  for (const a of candidates) {
    const idx = tileIndex(a, state.mapW, state.mapH);
    if (idx < 0 || isImpassable(ctx, state, idx)) continue;
    const owner = state.tiles[idx].ownerCity;
    if (owner !== null && state.cities[owner]?.owner !== city.owner) continue;
    const mil = militaryAt(ctx, state, a);
    const civ = civilianAt(ctx, state, a);
    if (civilian ? civ : mil) continue; // category slot taken
    const other = civilian ? mil : civ;
    if (other && other.owner !== city.owner) continue; // never spawn into an enemy stack
    const unit: Unit = {
      id: state.nextUnitId++,
      owner: city.owner,
      def: defId,
      q: a.q,
      r: a.r,
      hp: 100,
      moves: def.moves,
      stance: 'none',
      acted: false,
      order: null,
    };
    state.units[unit.id] = unit;
    recomputeVisibility(ctx, state, city.owner);
    return unit;
  }
  return null;
}

function pickBorderTile(ctx: Ctx, state: GameState, city: City): number | null {
  const maxR = ctx.rules.settings.borderMaxRadius;
  let best: { idx: number; dist: number; value: number } | null = null;
  for (const h of hexesWithin({ q: city.q, r: city.r }, maxR)) {
    const idx = tileIndex(h, state.mapW, state.mapH);
    if (idx < 0 || state.tiles[idx].ownerCity !== null) continue;
    const dist = hexDistance(h, { q: city.q, r: city.r });
    const y = tileYields(ctx, state, idx, city.owner);
    const value =
      y.food + y.production + y.gold + y.science + y.culture + (state.tiles[idx].resource ? 3 : 0);
    if (
      !best ||
      dist < best.dist ||
      (dist === best.dist && value > best.value) ||
      (dist === best.dist && value === best.value && idx < best.idx)
    ) {
      best = { idx, dist, value };
    }
  }
  return best?.idx ?? null;
}

export interface CityTurnOutput {
  science: number;
  gold: number;
}

/** One city's turn-start processing. Returns player-level yield contributions. */
export function processCity(ctx: Ctx, state: GameState, city: City): CityTurnOutput {
  const s = ctx.rules.settings;
  const { total } = cityYields(ctx, state, city);

  // production
  if (city.production.item) {
    city.production.progress += total.production;
    const item = city.production.item;
    const cost = itemCost(ctx, item);
    if (city.production.progress >= cost) {
      if (item.kind === 'building') {
        city.buildings.push(item.id);
        city.production.progress -= cost;
        city.production.item = null;
        pushEvent(state, {
          player: city.owner,
          type: 'prodDone',
          msg: `${city.name} completed ${ctx.rules.buildings[item.id].name}`,
          q: city.q,
          r: city.r,
        });
      } else {
        const def = ctx.rules.units[item.id];
        const isSettler = !!def.abilities?.includes('foundCity');
        if (isSettler && city.pop < 2) {
          // hold until the city can spare the people
        } else {
          const unit = placeProducedUnit(ctx, state, city, item.id);
          if (unit) {
            if (isSettler) city.pop -= 1;
            city.production.progress -= cost;
            city.production.item = null;
            pushEvent(state, {
              player: city.owner,
              type: 'prodDone',
              msg: `${city.name} trained ${def.name}`,
              q: city.q,
              r: city.r,
            });
          }
        }
      }
    }
  }

  // growth
  const net = total.food - city.pop * s.foodConsumptionPerPop;
  city.food += net;
  const threshold = growthThreshold(city.pop);
  if (city.food >= threshold) {
    city.pop += 1;
    city.food -= threshold;
    pushEvent(state, {
      player: city.owner,
      type: 'cityGrew',
      msg: `${city.name} grew to population ${city.pop}`,
      q: city.q,
      r: city.r,
    });
  } else if (city.food < 0) {
    if (city.pop > 1) {
      city.pop -= 1;
      pushEvent(state, {
        player: city.owner,
        type: 'cityStarved',
        msg: `${city.name} is starving!`,
        q: city.q,
        r: city.r,
      });
    }
    city.food = 0;
  }

  // culture -> borders
  city.culture += total.culture;
  const borderCost = borderThreshold(ctx, city.tilesClaimed);
  if (city.culture >= borderCost) {
    const idx = pickBorderTile(ctx, state, city);
    if (idx !== null) {
      state.tiles[idx].ownerCity = city.id;
      city.culture -= borderCost;
      city.tilesClaimed += 1;
      const a = axialOfIndex(idx, state.mapW);
      pushEvent(state, {
        player: city.owner,
        type: 'borders',
        msg: `${city.name}'s borders expanded`,
        q: a.q,
        r: a.r,
      });
      recomputeVisibility(ctx, state, city.owner);
    }
  }

  city.hp = Math.min(s.cityMaxHp, city.hp + s.cityRegen);
  return { science: total.science, gold: total.gold };
}

/** Transfer a city to its conqueror. Walls fall, the palace flees, people scatter. */
export function captureCity(ctx: Ctx, state: GameState, city: City, byPlayer: PlayerId): void {
  const s = ctx.rules.settings;
  const oldOwner = city.owner;
  state.relations[oldOwner][byPlayer].grudge += ctx.rules.settings.diplomacy.grudgeOnCapture;

  if (s.capturePopLossQuarter) city.pop = Math.max(1, city.pop - Math.floor(city.pop / 4));
  city.buildings = city.buildings.filter((b) => {
    const def = ctx.rules.buildings[b];
    return !def.defense && !def.unbuildable;
  });
  city.production = { item: null, progress: 0 };
  city.hp = s.cityCaptureHp;
  city.owner = byPlayer;

  // palace relocates to the old owner's oldest remaining city
  const remaining = sortedIds(state.cities)
    .map((id) => state.cities[id])
    .filter((c) => c.owner === oldOwner);
  const palaceIds = Object.values(ctx.rules.buildings)
    .filter((b) => b.unbuildable)
    .map((b) => b.id);
  if (remaining.length > 0) {
    const heir = remaining[0];
    for (const pid of palaceIds)
      if (!heir.buildings.includes(pid)) heir.buildings.push(pid);
    pushEvent(state, {
      player: oldOwner,
      type: 'capitalMoved',
      msg: `The capital has moved to ${heir.name}`,
      q: heir.q,
      r: heir.r,
    });
  }

  // civilians sheltering in the city are pressed into service
  const here = { q: city.q, r: city.r };
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.q === here.q && u.r === here.r && u.owner === oldOwner && isCivilian(ctx, u)) {
      captureCivilian(ctx, state, u, byPlayer);
    }
  }

  pushEvent(state, {
    player: null,
    type: 'cityCaptured',
    msg: `${state.players[byPlayer].name} captured ${city.name}!`,
    q: city.q,
    r: city.r,
  });
  recomputeVisibility(ctx, state, oldOwner);
  recomputeVisibility(ctx, state, byPlayer);
}
