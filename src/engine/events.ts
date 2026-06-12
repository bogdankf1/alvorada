import type { GameState, PlayerId } from './types';

const EVENT_CAP = 300;

export function pushEvent(
  state: GameState,
  ev: { player: PlayerId | null; type: string; msg: string; q?: number; r?: number },
): void {
  state.events.push({ seq: state.eventSeq++, turn: state.turn, ...ev });
  if (state.events.length > EVENT_CAP) state.events.splice(0, state.events.length - EVENT_CAP);
}
