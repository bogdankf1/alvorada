/**
 * The event deck: deterministic, data-driven world events. Fired at a player's
 * turn-start from the in-state RNG; effects are one-shot and player/capital-local.
 */
import type { Ctx, GameState, PlayerId } from '../types';
import { VIS_EXPLORED } from '../types';
import type { EventChoice, EventDef, EventEffect } from '../../data/types';
import { drawInt } from '../rng';
import { pushEvent } from '../events';
import { playerCities } from '../selectors';
import { placeProducedUnit } from './cities';
import { hexesWithin, tileIndex } from '../hex';

const EVENT_CHANCE_PER_MILLE = 90; // ~9% per eligible turn

function eligible(state: GameState, pid: PlayerId, ev: EventDef): boolean {
  const cities = playerCities(state, pid);
  if (cities.length === 0) return false;
  if (ev.minTurn !== undefined && state.turn < ev.minTurn) return false;
  if (ev.requiresPop !== undefined && !cities.some((c) => c.pop >= ev.requiresPop!)) return false;
  if (ev.oncePerGame && state.firedEvents.includes(ev.id)) return false;
  return true;
}

export function applyEventEffects(ctx: Ctx, state: GameState, pid: PlayerId, effects: EventEffect[]): void {
  const p = state.players[pid];
  const cap = playerCities(state, pid)[0];
  for (const e of effects) {
    switch (e.k) {
      case 'gold': p.gold = Math.max(0, p.gold + e.n); break;
      case 'science': p.science = Math.max(0, p.science + e.n); break;
      case 'faith': p.faith = Math.max(0, p.faith + e.n); break;
      case 'culture': p.policyProgress = Math.max(0, p.policyProgress + e.n); p.cultureTotal = Math.max(0, p.cultureTotal + e.n); break;
      case 'production': if (cap && cap.production.item) cap.production.progress = Math.max(0, cap.production.progress + e.n); break;
      case 'popChange': if (cap) cap.pop = Math.max(1, cap.pop + e.n); break;
      case 'unit': if (cap) placeProducedUnit(ctx, state, cap, e.unit); break;
      case 'reveal':
        if (cap) for (const h of hexesWithin({ q: cap.q, r: cap.r }, e.radius)) {
          const i = tileIndex(h, state.mapW, state.mapH);
          if (i >= 0 && state.visibility[pid][i] < VIS_EXPLORED) state.visibility[pid][i] = VIS_EXPLORED;
        }
        break;
    }
  }
}

/** Utility of a choice to the AI (pure; higher = better). Tie-break by lowest index. */
export function eventChoiceValue(choice: EventChoice): number {
  let v = choice.aiBias ?? 0;
  for (const e of choice.effects) {
    switch (e.k) {
      case 'gold': v += e.n; break;
      case 'science': v += e.n * 2; break;
      case 'faith': v += e.n; break;
      case 'culture': v += e.n; break;
      case 'production': v += e.n * 2; break;
      case 'popChange': v += e.n * 10; break;
      case 'unit': v += 25; break;
      case 'reveal': v += 3; break;
    }
  }
  return v;
}

/** At a player's turn-start: maybe fire one event. Ambient auto-resolves; interactive sets pendingEvent. */
export function maybeFireEvent(ctx: Ctx, state: GameState, pid: PlayerId): void {
  if (state.pendingEvent) {
    // If the owner was eliminated mid-event, clear it so the deck doesn't freeze for everyone.
    if (state.players[state.pendingEvent.player].alive) return;
    state.pendingEvent = null;
  }
  if (state.players[pid].barbarian) return;
  const cands = Object.keys(ctx.rules.events).sort()
    .map((id) => ctx.rules.events[id])
    .filter((ev) => eligible(state, pid, ev));
  if (!cands.length) return;
  if (drawInt(state, 1000) >= EVENT_CHANCE_PER_MILLE) return;
  const pick = cands[drawInt(state, cands.length)];
  if (pick.oncePerGame) state.firedEvents.push(pick.id);
  if (pick.choices.length <= 1) {
    applyEventEffects(ctx, state, pid, pick.choices[0]?.effects ?? []);
    pushEvent(state, { player: pid, type: 'eventChronicle', msg: `${state.players[pid].name}: ${pick.title}` });
  } else {
    state.pendingEvent = { player: pid, eventId: pick.id };
    pushEvent(state, { player: pid, type: 'eventChoice', msg: pick.title });
  }
}
