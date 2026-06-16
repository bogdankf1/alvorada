import type { GameState, PlayerId } from './types';

const EVENT_CAP = 300;

/** Event types that belong in the permanent game Chronicle (not transient chatter). */
const CHRONICLE_TYPES = new Set([
  'cityFounded', 'cityCaptured', 'wonderBuilt', 'war', 'denounce',
  'religionFounded', 'playerEliminated', 'victory', 'eventChronicle',
]);

export function pushEvent(
  state: GameState,
  ev: { player: PlayerId | null; type: string; msg: string; q?: number; r?: number },
): void {
  state.events.push({ seq: state.eventSeq++, turn: state.turn, ...ev });
  if (state.events.length > EVENT_CAP) state.events.splice(0, state.events.length - EVENT_CAP);
  if (CHRONICLE_TYPES.has(ev.type)) {
    state.chronicle.push({ turn: state.turn, type: ev.type, msg: ev.msg, q: ev.q, r: ev.r });
    if (state.chronicle.length > 1000) state.chronicle.splice(0, state.chronicle.length - 1000);
  }
}
