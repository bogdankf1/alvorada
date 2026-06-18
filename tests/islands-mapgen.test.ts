import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { generateMap } from '../src/engine/map/generate';
import type { GeneratedMap } from '../src/engine/map/generate';
import type { GameConfig, PlayerSpec } from '../src/engine/types';

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
    expect(fingerprint(generateMap(cfg(12345), STANDARD_RULESET))).toBe('fc8e9881');
    expect(fingerprint(generateMap(cfg(67890), STANDARD_RULESET))).toBe('d62ce45a');
  });
});

/** Label connected land components; return per-tile component id (-1 for ocean) + sizes. */
function label(m: GeneratedMap, W: number, H: number) {
  const comp = new Array(m.tiles.length).fill(-1);
  const sizes: number[] = [];
  const isLand = (i: number) => m.tiles[i].terrain !== 'ocean' && m.tiles[i].terrain !== 'coast';
  for (let i = 0; i < m.tiles.length; i++) {
    if (!isLand(i) || comp[i] !== -1) continue;
    let size = 0; const q = [i]; comp[i] = sizes.length;
    while (q.length) {
      const cur = q.pop()!; size++;
      const a = { q: cur % W, r: Math.floor(cur / W) };
      for (const nb of [ {q:a.q+1,r:a.r},{q:a.q-1,r:a.r},{q:a.q,r:a.r+1},{q:a.q,r:a.r-1},{q:a.q+1,r:a.r-1},{q:a.q-1,r:a.r+1} ]) {
        if (nb.q < 0 || nb.q >= W || nb.r < 0 || nb.r >= H) continue;
        const j = nb.r * W + nb.q;
        if (isLand(j) && comp[j] === -1) { comp[j] = comp[cur]; q.push(j); }
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
    const W = 46;
    const m = generateMap(cfg(2025, 'islands'), STANDARD_RULESET);
    const { comp, sizes } = label(m, W, 28);
    // label indexes comp by flat i = r*W + offsetCol; convert axial start to flat correctly
    const startComps = m.starts.map((s) => {
      const col = s.q + ((s.r - (s.r & 1)) >> 1);
      return comp[s.r * W + col];
    });
    expect(new Set(startComps).size).toBeGreaterThanOrEqual(2);            // distributed
    for (const c of startComps) expect(sizes[c]).toBeGreaterThanOrEqual(6); // a continent, not an islet
    expect(m.starts.length).toBe(4);
  });
});
