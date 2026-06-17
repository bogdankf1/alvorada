/**
 * Save format = the GameState itself (plain JSON). A future server snapshots
 * and ships exactly this. gameHash gives tests a cheap determinism fingerprint.
 */
import type { GameState } from './types';

export const SCHEMA_VERSION = 9;

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGame(json: string): GameState {
  const obj = JSON.parse(json) as GameState;
  if (typeof obj !== 'object' || obj === null || obj.schema !== SCHEMA_VERSION) {
    throw new Error('Unsupported or corrupted save');
  }
  return obj;
}

/** FNV-1a over canonical JSON. Equal states (built through the same code paths) hash equal. */
export function gameHash(state: GameState): string {
  const s = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
