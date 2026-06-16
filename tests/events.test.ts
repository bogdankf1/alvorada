import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { initialState } from '../src/engine/state';
import { ctx, customCtx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { maybeFireEvent, applyEventEffects } from '../src/engine/systems/worldevents';

function oneCity(c = ctx) {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  return thaw(s);
}

describe('events: foundation', () => {
  it('schema is 8 and the ruleset validates', () => {
    expect(SCHEMA_VERSION).toBe(8);
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });
  it('initial state has empty pendingEvent/chronicle/firedEvents', () => {
    const s = initialState({ seed: 3, mapW: 20, mapH: 16, players: [{ civ: 'rome', controller: 'ai' }, { civ: 'egypt', controller: 'ai' }] }, ctx);
    expect(s.pendingEvent).toBeNull();
    expect(s.chronicle).toEqual([]);
    expect(s.firedEvents).toEqual([]);
  });
});

describe('events: effects', () => {
  it('applies gold/science/pop/unit effects to the player and capital', () => {
    const s = oneCity();
    const cap = s.cities[Object.keys(s.cities).map(Number)[0]];
    const gold0 = s.players[0].gold, pop0 = cap.pop, units0 = Object.keys(s.units).length;
    applyEventEffects(ctx, s, 0, [{ k: 'gold', n: 25 }, { k: 'science', n: 10 }, { k: 'popChange', n: 1 }, { k: 'unit', unit: 'warrior' }]);
    expect(s.players[0].gold).toBe(gold0 + 25);
    expect(s.players[0].science).toBe(10);
    expect(cap.pop).toBe(pop0 + 1);
    expect(Object.keys(s.units).length).toBe(units0 + 1);
  });
  it('popChange floors capital pop at 1', () => {
    const s = oneCity();
    const cap = s.cities[Object.keys(s.cities).map(Number)[0]];
    applyEventEffects(ctx, s, 0, [{ k: 'popChange', n: -99 }]);
    expect(cap.pop).toBe(1);
  });
});

describe('events: firing', () => {
  it('fires an ambient event deterministically and auto-applies it', () => {
    const c = customCtx((r) => {
      r.events.test_boon = { id: 'test_boon', title: 'A Boon', body: '...', choices: [{ text: 'ok', effects: [{ k: 'gold', n: 50 }] }] };
    });
    const s = oneCity(c);
    const gold0 = s.players[0].gold;
    // force the event: drive maybeFireEvent until it fires (deterministic per rngState)
    let fired = false;
    for (let i = 0; i < 200 && !fired; i++) {
      const before = s.players[0].gold;
      maybeFireEvent(c, s, 0);
      if (s.players[0].gold !== before) fired = true;
    }
    expect(fired).toBe(true);
    expect(s.players[0].gold).toBeGreaterThanOrEqual(gold0 + 50);
    expect(s.pendingEvent).toBeNull(); // ambient never blocks
  });
  it('an interactive event sets pendingEvent instead of auto-applying', () => {
    const c = customCtx((r) => {
      r.events.test_choice = { id: 'test_choice', title: 'Choose', body: '...', choices: [
        { text: 'A', effects: [{ k: 'gold', n: 10 }] }, { text: 'B', effects: [{ k: 'science', n: 10 }] },
      ] };
    });
    const s = oneCity(c);
    let pend = false;
    for (let i = 0; i < 200 && !pend; i++) { maybeFireEvent(c, s, 0); if (s.pendingEvent) pend = true; }
    expect(pend).toBe(true);
    expect(s.pendingEvent).toEqual({ player: 0, eventId: 'test_choice' });
  });
});
