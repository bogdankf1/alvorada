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

export type EndTurnBlocker =
  | { kind: 'research' }
  | { kind: 'production'; city: number }
  | null;

export function endTurnBlocker(): EndTurnBlocker {
  const { game, viewingPlayer } = appStore.get();
  if (!game) return null;
  const player = game.players[viewingPlayer];
  if (!player.researching && availableTechs(gameCtx, game, viewingPlayer).length > 0) {
    return { kind: 'research' };
  }
  for (const c of playerCities(game, viewingPlayer)) {
    if (!c.production.item && productionOptions(gameCtx, game, c).length > 0) {
      return { kind: 'production', city: c.id };
    }
  }
  return null;
}

/** End the turn, or steer the player to what still needs a decision. */
export function endTurnRequest(): void {
  if (!isMyTurn()) return;
  const blocker = endTurnBlocker();
  const { game, viewingPlayer } = appStore.get();
  if (!game) return;
  if (blocker?.kind === 'research') {
    appStore.set({ overlay: 'tech' });
    return;
  }
  if (blocker?.kind === 'production') {
    const city = game.cities[blocker.city];
    appStore.set({ selectedCity: blocker.city, selectedUnit: null });
    focusCamera(city.q, city.r);
    return;
  }
  appStore.set({ selectedUnit: null, selectedCity: null });
  humanDispatch({ type: 'END_TURN', player: viewingPlayer });
}

export function idleUnits(): number[] {
  const { game, viewingPlayer } = appStore.get();
  if (!game) return [];
  return playerUnits(game, viewingPlayer)
    .filter((u) => u.moves > 0 && !u.order && u.stance !== 'fortified')
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
