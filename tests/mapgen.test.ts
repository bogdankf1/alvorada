import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/engine/map/generate';
import { STANDARD_RULESET } from '../src/data/standard';
import { hexDistance, neighbors, tileIndex } from '../src/engine/hex';
import type { GameConfig } from '../src/engine/types';

const config = (seed: number, players = 4): GameConfig => ({
  seed,
  mapW: 44,
  mapH: 28,
  players: Array.from({ length: players }, () => ({ civ: 'rome', controller: 'ai' as const })),
});

describe('map generation', () => {
  it('is deterministic: same seed, same world', () => {
    const a = generateMap(config(42), STANDARD_RULESET);
    const b = generateMap(config(42), STANDARD_RULESET);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds differ', () => {
    const a = generateMap(config(1), STANDARD_RULESET);
    const b = generateMap(config(2), STANDARD_RULESET);
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles));
  });

  it('produces a sane world across seeds', () => {
    for (const seed of [7, 99, 1234, 555555]) {
      const { tiles, starts } = generateMap(config(seed), STANDARD_RULESET);
      const land = tiles.filter(
        (t) => !STANDARD_RULESET.terrains[t.terrain].water,
      ).length;
      const frac = land / tiles.length;
      expect(frac, `seed ${seed} land fraction`).toBeGreaterThan(0.25);
      expect(frac, `seed ${seed} land fraction`).toBeLessThan(0.5);
      expect(starts).toHaveLength(4);

      // starts: on land, apart, and on one connected landmass
      for (let i = 0; i < starts.length; i++) {
        const idx = tileIndex(starts[i], 44, 28);
        const t = tiles[idx];
        expect(STANDARD_RULESET.terrains[t.terrain].water).toBeFalsy();
        expect(t.elevation).not.toBe('mountain');
        for (let j = i + 1; j < starts.length; j++) {
          expect(hexDistance(starts[i], starts[j])).toBeGreaterThanOrEqual(5);
        }
      }
      const reach = new Set<number>([tileIndex(starts[0], 44, 28)]);
      const queue = [...reach];
      while (queue.length) {
        const cur = queue.pop()!;
        const a = { q: 0, r: 0 };
        const row = Math.floor(cur / 44);
        a.r = row;
        a.q = (cur % 44) - ((row - (row & 1)) >> 1);
        for (const nb of neighbors(a)) {
          const j = tileIndex(nb, 44, 28);
          if (j >= 0 && !reach.has(j) && !STANDARD_RULESET.terrains[tiles[j].terrain].water) {
            reach.add(j);
            queue.push(j);
          }
        }
      }
      for (const s of starts) {
        expect(reach.has(tileIndex(s, 44, 28)), `seed ${seed}: starts share a continent`).toBe(true);
      }

      // strategic fairness: horses and iron near every start
      for (const s of starts) {
        for (const res of ['horses', 'iron']) {
          let found = 0;
          for (let i = 0; i < tiles.length; i++) {
            const row = Math.floor(i / 44);
            const a = { q: (i % 44) - ((row - (row & 1)) >> 1), r: row };
            if (tiles[i].resource === res && hexDistance(a, s) <= 4) found++;
          }
          expect(found, `seed ${seed}: ${res} near start`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});
