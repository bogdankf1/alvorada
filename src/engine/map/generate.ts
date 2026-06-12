/**
 * Seeded map generation. Policy (how the world is shaped) lives here;
 * content (what terrains/resources exist) comes entirely from the ruleset.
 *
 * Pipeline: elevation fbm + radial falloff -> land mask at a target fraction;
 * latitude+moisture -> terrain; percentile elevation -> hills/mountains;
 * coast pass; features; weighted resources; start placement on the largest
 * landmass with a strategic-resource fairness pass.
 */
import type { Ruleset } from '../../data/types';
import type { Axial, GameConfig, Tile } from '../types';
import { axialOfIndex, hexDistance, hexToPixel, hexesWithin, neighbors, tileIndex } from '../hex';
import { makeRng, hash2, type Rng } from '../rng';
import { fbm } from './noise';

export interface GeneratedMap {
  tiles: Tile[];
  starts: Axial[];
}

const LAND_FRACTION = 0.4;
const NOISE_SCALE = 0.055; // noise-space units per pixel
const HILL_PCT = 0.72; // land percentile above which hills appear
const MOUNTAIN_PCT = 0.94;
const RESOURCE_CHANCE = 0.11;

export function generateMap(config: GameConfig, rules: Ruleset): GeneratedMap {
  const { mapW: W, mapH: H, seed } = config;
  const n = W * H;
  const playerCount = config.players.length;

  // Bounded deterministic retries if the continent can't host every start.
  for (let attempt = 0; attempt < 8; attempt++) {
    const rng = makeRng((seed ^ (attempt * 0x9e3779b9)) | 0);
    const result = tryGenerate(W, H, n, seed + attempt * 7919, rng, rules, playerCount);
    if (result) return result;
  }
  throw new Error('map generation failed: could not place starts');
}

function tryGenerate(
  W: number,
  H: number,
  n: number,
  seed: number,
  rng: Rng,
  rules: Ruleset,
  playerCount: number,
): GeneratedMap | null {
  // --- 1. elevation field + radial falloff -> land mask ---
  const elevation = new Array<number>(n);
  const px = new Array<number>(n);
  const py = new Array<number>(n);
  const maxPix = hexToPixel({ q: W, r: H }, 1);
  for (let i = 0; i < n; i++) {
    const a = axialOfIndex(i, W);
    const p = hexToPixel(a, 1);
    px[i] = p.x;
    py[i] = p.y;
    // normalized ellipse distance from map center (pixel space, aspect-true)
    const cx = (p.x / maxPix.x) * 2 - 1 + (a.r / H) * 0; // x already includes shear
    const cy = (p.y / maxPix.y) * 2 - 1;
    const d = Math.sqrt(cx * cx * 1.15 + cy * cy * 1.35);
    const falloff = Math.max(0, d - 0.55) * 1.1;
    elevation[i] = fbm(p.x * NOISE_SCALE, p.y * NOISE_SCALE, seed) - falloff;
  }
  // sea level: pick threshold hitting the target land fraction (deterministic)
  const sorted = [...elevation].sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(n * (1 - LAND_FRACTION))];
  const land = elevation.map((e, i) => {
    const a = axialOfIndex(i, W);
    const col = i % W;
    if (col === 0 || col === W - 1 || a.r === 0 || a.r === H - 1) return false; // ocean rim
    return e > seaLevel;
  });

  // --- 2. landmasses; largest continent must host all starts ---
  const component = new Array<number>(n).fill(-1);
  let componentCount = 0;
  const componentSizes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!land[i] || component[i] !== -1) continue;
    let size = 0;
    const queue = [i];
    component[i] = componentCount;
    while (queue.length) {
      const cur = queue.pop()!;
      size++;
      for (const nb of neighbors(axialOfIndex(cur, W))) {
        const j = tileIndex(nb, W, H);
        if (j >= 0 && land[j] && component[j] === -1) {
          component[j] = componentCount;
          queue.push(j);
        }
      }
    }
    componentSizes.push(size);
    componentCount++;
  }
  if (componentSizes.length === 0) return null;
  const mainContinent = componentSizes.indexOf(Math.max(...componentSizes));

  // --- 3. climate -> base terrain ---
  const tiles: Tile[] = new Array(n);
  const landElevSorted = elevation.filter((_, i) => land[i]).sort((a, b) => a - b);
  const hillLevel = landElevSorted[Math.floor(landElevSorted.length * HILL_PCT)] ?? Infinity;
  const mountainLevel =
    landElevSorted[Math.floor(landElevSorted.length * MOUNTAIN_PCT)] ?? Infinity;

  for (let i = 0; i < n; i++) {
    const a = axialOfIndex(i, W);
    if (!land[i]) {
      tiles[i] = blank('ocean');
      continue;
    }
    const lat = Math.abs(a.r - (H - 1) / 2) / ((H - 1) / 2); // 0 equator, 1 pole
    const temp = 1 - lat + (fbm(px[i] * 0.08, py[i] * 0.08, seed + 31) - 0.5) * 0.28;
    const moist = fbm(px[i] * 0.07, py[i] * 0.07, seed + 67);

    let terrain: string;
    if (temp < 0.14) terrain = 'snow';
    else if (temp < 0.32) terrain = 'tundra';
    else if (temp > 0.72 && moist < 0.42) terrain = 'desert';
    else if (moist < 0.45) terrain = 'plains';
    else terrain = 'grassland';

    const t = blank(terrain);
    if (elevation[i] > mountainLevel) t.elevation = 'mountain';
    else if (elevation[i] > hillLevel) t.elevation = 'hill';

    // features
    if (t.elevation !== 'mountain') {
      const forestNoise = fbm(px[i] * 0.09, py[i] * 0.09, seed + 131);
      if (temp > 0.74 && moist > 0.58 && (terrain === 'grassland' || terrain === 'plains')) {
        t.feature = 'jungle';
      } else if (
        forestNoise > 0.56 &&
        moist > 0.42 &&
        temp > 0.2 &&
        temp < 0.8 &&
        (terrain === 'grassland' || terrain === 'plains' || terrain === 'tundra')
      ) {
        t.feature = 'forest';
      } else if (terrain === 'desert' && t.elevation === 'flat' && hash2(i, 9, seed) < 0.05) {
        t.feature = 'oasis';
      }
    }
    tiles[i] = t;
  }

  // --- 4. coast pass ---
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const isCoast = neighbors(axialOfIndex(i, W)).some((nb) => {
      const j = tileIndex(nb, W, H);
      return j >= 0 && land[j];
    });
    if (isCoast) tiles[i].terrain = 'coast';
  }

  // --- 5. resources (weighted by def spawn tables) ---
  const resourceDefs = Object.values(rules.resources).sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (t.elevation === 'mountain' || t.feature === 'oasis') continue;
    if (rng.next() >= RESOURCE_CHANCE) continue;
    const candidates = resourceDefs.filter(
      (r) =>
        r.spawn.terrains.includes(t.terrain) &&
        (!r.spawn.elevations || r.spawn.elevations.includes(t.elevation)),
    );
    if (!candidates.length) continue;
    const totalWeight = candidates.reduce((s, r) => s + r.spawn.weight, 0);
    let roll = rng.next() * totalWeight;
    for (const r of candidates) {
      roll -= r.spawn.weight;
      if (roll <= 0) {
        t.resource = r.id;
        break;
      }
    }
  }

  // --- 6. starts on the main continent ---
  const starts = placeStarts(tiles, W, H, component, mainContinent, playerCount, rules);
  if (!starts) return null;

  // --- 7. fairness: strategic resources near every start ---
  for (const start of starts) {
    for (const res of resourceDefs) {
      if (res.kind !== 'strategic') continue;
      ensureResourceNear(tiles, W, H, start, res.id, 2, 4, rules);
    }
  }

  return { tiles, starts };
}

function blank(terrain: string): Tile {
  return {
    terrain,
    elevation: 'flat',
    feature: null,
    resource: null,
    improvement: null,
    ownerCity: null,
  };
}

function startScore(tiles: Tile[], W: number, H: number, center: Axial, rules: Ruleset): number {
  let score = 0;
  for (const h of hexesWithin(center, 2)) {
    const j = tileIndex(h, W, H);
    if (j < 0) continue;
    const t = tiles[j];
    const terr = rules.terrains[t.terrain];
    const elev = rules.elevations[t.elevation];
    const feat = t.feature ? rules.features[t.feature] : null;
    const food =
      (terr.yields.food ?? 0) + (elev.yields.food ?? 0) + (feat?.yields.food ?? 0);
    const prod =
      (terr.yields.production ?? 0) + (elev.yields.production ?? 0) + (feat?.yields.production ?? 0);
    score += food * 3 + prod * 2 + (terr.yields.gold ?? 0);
    if (t.resource) score += 2;
  }
  return score;
}

function placeStarts(
  tiles: Tile[],
  W: number,
  H: number,
  component: number[],
  mainContinent: number,
  playerCount: number,
  rules: Ruleset,
): Axial[] | null {
  const candidates: { a: Axial; score: number; i: number }[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (component[i] !== mainContinent) continue;
    const t = tiles[i];
    if (t.elevation === 'mountain') continue;
    if (t.terrain === 'snow' || t.terrain === 'desert') continue;
    const a = axialOfIndex(i, W);
    const col = i % W;
    if (col < 2 || col > W - 3 || a.r < 2 || a.r > H - 3) continue;
    candidates.push({ a, score: startScore(tiles, W, H, a, rules), i });
  }
  if (candidates.length < playerCount) return null;
  candidates.sort((x, y) => y.score - x.score || x.i - y.i);

  for (let minDist = Math.max(8, Math.floor((W + H) / 6)); minDist >= 5; minDist--) {
    const chosen: Axial[] = [];
    for (const c of candidates) {
      if (chosen.every((s) => hexDistance(s, c.a) >= minDist)) {
        chosen.push(c.a);
        if (chosen.length === playerCount) return chosen;
      }
    }
  }
  return null;
}

/** Top spawned `resId` up to `want` sources within `radius` of a start. */
function ensureResourceNear(
  tiles: Tile[],
  W: number,
  H: number,
  start: Axial,
  resId: string,
  want: number,
  radius: number,
  rules: Ruleset,
): void {
  const res = rules.resources[resId];
  const area = hexesWithin(start, radius)
    .map((h) => tileIndex(h, W, H))
    .filter((j) => j >= 0);
  let have = area.filter((j) => tiles[j].resource === resId).length;
  if (have >= want) return;
  for (const j of area) {
    const t = tiles[j];
    if (
      t.resource === null &&
      t.feature === null &&
      res.spawn.terrains.includes(t.terrain) &&
      (!res.spawn.elevations || res.spawn.elevations.includes(t.elevation)) &&
      hexDistance(axialOfIndex(j, W), start) >= 1
    ) {
      t.resource = resId;
      have++;
      if (have >= want) return;
    }
  }
}
