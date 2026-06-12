/**
 * Minimal external store + React bridge. Game state lives here (set by the
 * driver); UI state (selection, overlays, toasts) beside it. Immer's
 * structural sharing keeps snapshot comparisons cheap.
 */
import { useSyncExternalStore } from 'react';
import type { Action, GameState, PlayerId } from '../engine/types';

export interface Toast {
  id: number;
  type: string;
  msg: string;
  q?: number;
  r?: number;
}

export interface AiLogEntry {
  turn: number;
  player: PlayerId;
  reason: string;
}

export interface AppState {
  screen: 'menu' | 'game';
  game: GameState | null;
  viewingPlayer: PlayerId; // the fog lens; hot-seat/multiplayer ready
  selectedUnit: number | null;
  selectedCity: number | null;
  hoveredTile: number | null;
  overlay: 'tech' | 'menu' | null;
  aiThinking: boolean;
  toasts: Toast[];
  aiLog: AiLogEntry[];
  aiLogOpen: boolean;
  cameraFocus: { q: number; r: number; seq: number } | null; // one-shot pan request
  warConfirm: { target: PlayerId; followUp: Action } | null;
  winnerSeen: boolean;
}

const initial: AppState = {
  screen: 'menu',
  game: null,
  viewingPlayer: 0,
  selectedUnit: null,
  selectedCity: null,
  hoveredTile: null,
  overlay: null,
  aiThinking: false,
  toasts: [],
  aiLog: [],
  aiLogOpen: false,
  cameraFocus: null,
  warConfirm: null,
  winnerSeen: false,
};

type Listener = () => void;

function createStore(value: AppState) {
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) {
      const patch = typeof update === 'function' ? update(value) : update;
      value = { ...value, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const appStore = createStore(initial);

export function useApp<S>(selector: (s: AppState) => S): S {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.get()));
}

let toastSeq = 1;
export function pushToast(t: Omit<Toast, 'id'>): void {
  const toast = { ...t, id: toastSeq++ };
  appStore.set((prev) => ({ toasts: [...prev.toasts.slice(-4), toast] }));
  setTimeout(() => {
    appStore.set((prev) => ({ toasts: prev.toasts.filter((x) => x.id !== toast.id) }));
  }, 6500);
}

let focusSeq = 1;
export function focusCamera(q: number, r: number): void {
  appStore.set({ cameraFocus: { q, r, seq: focusSeq++ } });
}
