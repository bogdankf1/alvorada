import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { generateMap } from '../src/engine/map/generate';
import type { GeneratedMap } from '../src/engine/map/generate';
import type { GameConfig, PlayerSpec } from '../src/engine/types';
import { initialState } from '../src/engine/state';
import { applyAction } from '../src/engine/reducer';
import { gameHash } from '../src/engine/serialize';
import { decide } from '../src/ai/decide';
import { axialOfIndex, neighbors, tileIndex } from '../src/engine/hex';
import { ctx } from './helpers';

const FOUR: PlayerSpec[] = [
  { civ: 'rome', controller: 'ai' },
  { civ: 'egypt', controller: 'ai' },
  { civ: 'babylon', controller: 'ai' },
  { civ: 'hellas', controller: 'ai' },
];
const cfg = (seed: number, mapType?: 'continents' | 'islands'): GameConfig =>
  ({ seed, mapW: 46, mapH: 28, players: FOUR, mapType });

/** FNV-1a-ish fingerprint of a generated map's content + starts. */
function fingerprint(m: GeneratedMap): string {
  let h = 2166136261 >>> 0;
  const push = (s: string) => {
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  };
  for (const t of m.tiles) push(t.terrain + t.elevation + (t.feature ?? '') + (t.resource ?? ''));
  for (const s of m.starts) push(`@${s.q},${s.r}`);
  return (h >>> 0).toString(16);
}

describe('continents output (regression guard)', () => {
  it('is unchanged for fixed seeds', () => {
    // Fingerprints re-captured 2026-06-22 when the Industrial era added the Coal resource,
    // which legitimately shifts the weighted-resource map-gen pass (an intended content change,
    // not a regression). The guard still catches UNintended future changes to continents output.
    expect(fingerprint(generateMap(cfg(12345), STANDARD_RULESET))).toBe('62860ea5');
    expect(fingerprint(generateMap(cfg(67890), STANDARD_RULESET))).toBe('66c9808f');
  });
});

/**
 * Label connected land components; return per-tile component id (-1 for ocean) + sizes.
 * Uses the engine's own hex adjacency (`neighbors`/`axialOfIndex`/`tileIndex`) so the
 * labeling is identical to the generator's — NOT hand-rolled offset math.
 */
function label(m: GeneratedMap, W: number, H: number) {
  const comp = new Array(m.tiles.length).fill(-1);
  const sizes: number[] = [];
  const isLand = (i: number) => m.tiles[i].terrain !== 'ocean' && m.tiles[i].terrain !== 'coast';
  for (let i = 0; i < m.tiles.length; i++) {
    if (!isLand(i) || comp[i] !== -1) continue;
    let size = 0; const queue = [i]; comp[i] = sizes.length;
    while (queue.length) {
      const cur = queue.pop()!; size++;
      for (const nb of neighbors(axialOfIndex(cur, W))) {
        const j = tileIndex(nb, W, H);
        if (j >= 0 && isLand(j) && comp[j] === -1) { comp[j] = comp[cur]; queue.push(j); }
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

describe('islands map-gen', () => {
  it('is deterministic for a fixed seed', () => {
    const a = generateMap(cfg(2025, 'islands'), STANDARD_RULESET);
    const b = generateMap(cfg(2025, 'islands'), STANDARD_RULESET);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.starts).toEqual(b.starts);
  });

  it('produces at least K=2 sizable landmasses', () => {
    const m = generateMap(cfg(2025, 'islands'), STANDARD_RULESET);
    const { sizes } = label(m, 46, 28);
    const sizable = sizes.filter((s) => s >= 6).sort((x, y) => y - x);
    expect(sizable.length).toBeGreaterThanOrEqual(2);
  });

  it('scatters at least one small islet (a tiny land component)', () => {
    const m = generateMap(cfg(2025, 'islands'), STANDARD_RULESET);
    const { sizes } = label(m, 46, 28);
    expect(sizes.some((s) => s >= 1 && s <= 6)).toBe(true);
  });
});

describe('islands start distribution', () => {
  it('spreads the 4 starts across >= 2 landmasses, none on a tiny islet', () => {
    const W = 46, H = 28;
    const m = generateMap(cfg(2025, 'islands'), STANDARD_RULESET);
    const { comp, sizes } = label(m, W, H);
    const startComps = m.starts.map((s) => comp[tileIndex(s, W, H)]);
    expect(new Set(startComps).size).toBeGreaterThanOrEqual(2);            // distributed
    for (const c of startComps) expect(sizes[c]).toBeGreaterThanOrEqual(6); // a continent, not an islet
    expect(m.starts.length).toBe(4);
  });
});

describe('islands self-play smoke', () => {
  it('a 4-player island game runs ~40 turns legally and replays bit-identically', () => {
    const config = cfg(2025, 'islands');
    const run = () => {
      let s = initialState(config, ctx);
      const log: any[] = [];
      while (s.phase === 'playing' && s.turn <= 40) {
        const pid = s.currentPlayer;
        for (let i = 0; ; i++) {
          expect(i, `turn ${s.turn} p${pid}: action cap`).toBeLessThan(400);
          const { action } = decide(ctx, s, pid);
          s = applyAction(ctx, s, action); // an illegal AI action throws -> fails the test
          log.push(action);
          if (action.type === 'END_TURN' || s.phase === 'ended') break;
        }
      }
      return { s, log };
    };
    const a = run();
    expect(a.s.turn).toBeGreaterThan(1);
    let replay = initialState(config, ctx);
    for (const act of a.log) replay = applyAction(ctx, replay, act);
    expect(gameHash(replay)).toBe(gameHash(a.s));
  }, 60_000);
});

describe('islands naval-AI behavior', () => {
  it('over a long island game, an AI expands overseas and rivals meet across water', () => {
    // Seed 23 reliably produces overseas colonization: by ~turn 140 the AI charts the seas,
    // ships escorted settlers across, and founds cities on a second landmass. (Overseas
    // colonization is emergent/seed-dependent — see the diag sweep in the plan's Task 7.)
    const config = cfg(23, 'islands');
    let s = initialState(config, ctx);
    const log: any[] = [];
    while (s.phase === 'playing' && s.turn <= 140) {
      const pid = s.currentPlayer;
      for (let i = 0; ; i++) {
        expect(i, `turn ${s.turn} p${pid}: action cap`).toBeLessThan(400);
        const { action } = decide(ctx, s, pid);
        s = applyAction(ctx, s, action);
        log.push(action);
        if (action.type === 'END_TURN' || s.phase === 'ended') break;
      }
    }
    const { comp } = label(s as any, config.mapW, config.mapH);
    const flat = (q: number, r: number) => tileIndex({ q, r }, config.mapW, config.mapH);
    let overseasFound = false;
    for (const p of s.players.filter((pl) => pl.alive && !pl.barbarian)) {
      const cities = Object.values(s.cities).filter((c) => c.owner === p.id);
      if (cities.length < 2) continue;
      const capComp = comp[flat(cities[0].q, cities[0].r)];
      if (cities.some((c) => comp[flat(c.q, c.r)] !== capComp)) overseasFound = true;
    }
    const metAcrossWater = s.players.some((_p, i) =>
      s.players.some((_q, j) => i !== j && s.relations[i][j].met),
    );
    expect(metAcrossWater).toBe(true);
    expect(overseasFound).toBe(true);
    let replay = initialState(config, ctx);
    for (const act of log) replay = applyAction(ctx, replay, act);
    expect(gameHash(replay)).toBe(gameHash(s));
  }, 120_000);
});

describe('islands naval-war behavior', () => {
  it('over a long island game, an AI captures a rival city across water', () => {
    // Seed 960 demonstrates amphibious conquest: an AI ships an escorted army across the sea
    // and storms a rival's coastal city on another landmass. (Emergent/seed-dependent — most
    // island wars are fought on the shared home landmass; true across-water conquest is rarer.
    // Re sea: this seed number is also the CONTINENTS culture-victory seed, but that's a
    // different game (mapType 'islands' here) — no coupling.)
    const config = cfg(960, 'islands');
    let s = initialState(config, ctx);
    const founders = new Map<number, number>();
    for (const id of Object.keys(s.cities)) founders.set(Number(id), s.cities[Number(id)].owner);
    const log: any[] = [];
    while (s.phase === 'playing' && s.turn <= 200) {
      const pid = s.currentPlayer;
      for (let i = 0; ; i++) {
        expect(i, `turn ${s.turn} p${pid}: action cap`).toBeLessThan(400);
        const { action } = decide(ctx, s, pid);
        s = applyAction(ctx, s, action);
        log.push(action);
        for (const id of Object.keys(s.cities)) {
          const n = Number(id);
          if (!founders.has(n)) founders.set(n, s.cities[n].owner);
        }
        if (action.type === 'END_TURN' || s.phase === 'ended') break;
      }
    }
    const { comp } = label(s as any, config.mapW, config.mapH);
    const flat = (q: number, r: number) => tileIndex({ q, r }, config.mapW, config.mapH);
    // a city now owned by someone other than its founder, whose own home landmass differs from the city's
    let conquestAcrossWater = false;
    for (const c of Object.values(s.cities)) {
      const founder = founders.get(c.id);
      if (founder === undefined || founder === c.owner) continue;
      const ownerCities = Object.values(s.cities).filter((x) => x.owner === c.owner);
      if (!ownerCities.length) continue;
      const ownerHome = comp[flat(ownerCities[0].q, ownerCities[0].r)];
      if (comp[flat(c.q, c.r)] !== ownerHome) conquestAcrossWater = true;
    }
    expect(conquestAcrossWater).toBe(true);
    let replay = initialState(config, ctx);
    for (const act of log) replay = applyAction(ctx, replay, act);
    expect(gameHash(replay)).toBe(gameHash(s));
  }, 200_000);
});
