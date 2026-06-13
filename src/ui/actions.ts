/**
 * UI-side action helpers shared by the map, panels, and keyboard:
 * dispatch with error toasts, the blocker-aware end turn, idle-unit cycling.
 */
import type { Action } from '../engine/types';
import { availableTechs, playerCities, playerUnits, productionOptions } from '../engine/selectors';
import { currentGame, gameCtx } from '../app/driver';
import { appStore, focusCamera, pushToast } from '../app/store';

export function humanDispatch(action: Action): boolean {
  const game = currentGame;
  if (!game) return false;
  const res = game.dispatch(action);
  if (!res.ok && res.reason) {
    pushToast({ type: 'invalid', msg: res.reason });
  }
  return res.ok;
}

export function isMyTurn(): boolean {
  const { game, viewingPlayer, aiThinking } = appStore.get();
  return (
    !!game &&
    game.phase === 'playing' &&
    !aiThinking &&
    game.currentPlayer === viewingPlayer &&
    game.players[viewingPlayer].alive
  );
}

/**
 * What stands between the player and ending the turn, in priority order:
 * pick research → set a city's production → give idle units orders → ready.
 * The End Turn button reads its label/action straight from this.
 */
export type TurnGate =
  | { kind: 'research' }
  | { kind: 'production'; city: number }
  | { kind: 'idle'; count: number }
  | { kind: 'ready' };

export function turnGate(): TurnGate {
  const { game, viewingPlayer } = appStore.get();
  if (!game) return { kind: 'ready' };
  const player = game.players[viewingPlayer];
  if (!player.researching && availableTechs(gameCtx, game, viewingPlayer).length > 0) {
    return { kind: 'research' };
  }
  for (const c of playerCities(game, viewingPlayer)) {
    if (!c.production.item && productionOptions(gameCtx, game, c).length > 0) {
      return { kind: 'production', city: c.id };
    }
  }
  const idle = idleUnits();
  if (idle.length > 0) return { kind: 'idle', count: idle.length };
  return { kind: 'ready' };
}

/**
 * One click on End Turn: resolve the next gate. Steer to research/production,
 * cycle to the next idle unit, or — only when nothing remains — end the turn.
 * Idle units are gated like Civ: orders first, the turn ends after.
 */
export function endTurnRequest(): void {
  if (!isMyTurn()) return;
  const { game, viewingPlayer } = appStore.get();
  if (!game) return;
  const gate = turnGate();
  switch (gate.kind) {
    case 'research':
      appStore.set({ overlay: 'tech' });
      return;
    case 'production': {
      const city = game.cities[gate.city];
      appStore.set({ selectedCity: gate.city, selectedUnit: null });
      focusCamera(city.q, city.r);
      return;
    }
    case 'idle':
      selectNextIdleUnit();
      return;
    case 'ready':
      appStore.set({ selectedUnit: null, selectedCity: null });
      humanDispatch({ type: 'END_TURN', player: viewingPlayer });
      return;
  }
}

/** Units that still need their first order this turn (untouched, can still act). */
export function idleUnits(): number[] {
  const { game, viewingPlayer } = appStore.get();
  if (!game) return [];
  return playerUnits(game, viewingPlayer)
    .filter((u) => u.moves > 0 && !u.acted && !u.order && u.stance !== 'fortified')
    .map((u) => u.id);
}

export function selectNextIdleUnit(): void {
  const { game, selectedUnit } = appStore.get();
  if (!game) return;
  const ids = idleUnits();
  if (!ids.length) return;
  const after = selectedUnit !== null ? ids.filter((id) => id > selectedUnit) : [];
  const pick = after[0] ?? ids[0];
  const u = game.units[pick];
  appStore.set({ selectedUnit: pick, selectedCity: null });
  focusCamera(u.q, u.r);
}
