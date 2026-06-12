/**
 * Saves are just serialized GameState (the engine's own format).
 * localStorage autosave + manual export/import as a .json file.
 */
import type { GameState } from '../engine/types';
import { deserializeGame, serializeGame } from '../engine/serialize';

const AUTOSAVE_KEY = 'alvorada:autosave';

export function autosave(state: GameState): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeGame(state));
  } catch {
    // storage full or unavailable: the game must keep playing
  }
}

export function loadAutosave(): GameState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? deserializeGame(raw) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportSave(state: GameState): void {
  const blob = new Blob([serializeGame(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alvorada-turn-${state.turn}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSave(file: File): Promise<GameState> {
  return file.text().then((text) => deserializeGame(text));
}
