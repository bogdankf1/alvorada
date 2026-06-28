/**
 * UI-side action helpers shared by the map, panels, and keyboard:
 * dispatch with error toasts, the blocker-aware end turn, idle-unit cycling.
 */
import type { Action } from '../engine/types';
import { availableTechs, playerCities, playerUnits, productionOptions, unitNeedsOrders } from '../engine/selectors';
import { currentGame, gameCtx } from '../app/driver';
import { appStore, focusCamera, pushToast } from '../app/store';
import { actionSfx, playSfx } from './audio';

export function humanDispatch(action: Action): boolean {
  const game = currentGame;
  if (!game) return false;
  const res = game.dispatch(action);
  if (!res.ok && res.reason) {
    pushToast({ type: 'invalid', msg: res.reason });
  }
  // QoL: once a unit finishes (out of moves / skipped / fortified / asleep / gone),
  // jump to the next unit that still needs orders. Disband manages its own selection.
  if (res.ok && 'unit' in action && action.type !== 'DISBAND') {
    const u = game.state.units[action.unit];
    if (!u || !unitNeedsOrders(u)) scheduleNextIdleUnit(action.unit);
  }
  if (res.ok) {
    const sfx = actionSfx(action.type);
    if (sfx) playSfx(sfx);
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
  | { kind: 'event' }
  | { kind: 'research' }
  | { kind: 'production'; city: number }
  | { kind: 'idle'; count: number }
  | { kind: 'ready' };

export function turnGate(): TurnGate {
  const { game, viewingPlayer } = appStore.get();
  if (!game) return { kind: 'ready' };
  if (game.pendingEvent && game.pendingEvent.player === viewingPlayer) return { kind: 'event' };
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
    case 'event':
      return; // the event modal is up; the player must choose
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
  return playerUnits(game, viewingPlayer).filter(unitNeedsOrders).map((u) => u.id);
}

/**
 * Brief pause before auto-jumping to the next idle unit, so the player sees the
 * result of the action they just gave (move, attack, found, …) before the camera
 * moves on. Manual input cancels it: re-scheduling clears the old timer, and the
 * callback bails if the turn ended or the player grabbed a different unit/city.
 */
const ADVANCE_DELAY = 450;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNextIdleUnit(justActed: number): void {
  if (advanceTimer !== null) clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    advanceTimer = null;
    if (!isMyTurn()) return; // turn ended / AI is up — don't yank the camera
    const { selectedUnit, selectedCity } = appStore.get();
    if (selectedCity !== null) return; // player opened a city meanwhile
    if (selectedUnit !== null && selectedUnit !== justActed) return; // player picked another unit
    selectNextIdleUnit();
  }, ADVANCE_DELAY);
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
