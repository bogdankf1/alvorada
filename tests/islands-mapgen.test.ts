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
