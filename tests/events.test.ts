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

import { validateAction } from '../src/engine/validate';
import { decide } from '../src/ai/decide';

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

describe('events: EVENT_CHOICE', () => {
  function pendingChoice() {
    const c = customCtx((r) => {
      r.events.test_choice = { id: 'test_choice', title: 'Choose', body: '...', choices: [
        { text: 'Gold', effects: [{ k: 'gold', n: 40 }] }, { text: 'Science', effects: [{ k: 'science', n: 40 }] },
      ] };
    });
    const s = oneCity(c);
    for (let i = 0; i < 200 && !s.pendingEvent; i++) maybeFireEvent(c, s, 0);
    return { c, s };
  }
  it('resolving applies the chosen effects and clears pendingEvent', () => {
    const { c, s } = pendingChoice();
    expect(s.pendingEvent).not.toBeNull();
    const gold0 = s.players[0].gold;
    const ns = applyAction(c, s, { type: 'EVENT_CHOICE', player: 0, choice: 0 });
    expect(ns.players[0].gold).toBe(gold0 + 40);
    expect(ns.pendingEvent).toBeNull();
  });
  it('blocks other actions while an event is pending', () => {
    const { c, s } = pendingChoice();
    const v = validateAction(c, s, { type: 'END_TURN', player: 0 });
    expect(v.ok).toBe(false);
    const v2 = validateAction(c, s, { type: 'EVENT_CHOICE', player: 0, choice: 1 });
    expect(v2.ok).toBe(true);
  });
  it('rejects an out-of-range choice', () => {
    const { c, s } = pendingChoice();
    expect(validateAction(c, s, { type: 'EVENT_CHOICE', player: 0, choice: 9 }).ok).toBe(false);
  });
});

describe('events: AI resolution', () => {
  it('the AI returns EVENT_CHOICE for the higher-value choice', () => {
    const c = customCtx((r) => {
      r.events.test_choice = { id: 'test_choice', title: 'Choose', body: '...', choices: [
        { text: 'A little gold', effects: [{ k: 'gold', n: 5 }] },
        { text: 'Much science', effects: [{ k: 'science', n: 40 }] }, // value 80 >> 5
      ] };
    });
    const s = oneCity(c);
    for (let i = 0; i < 200 && !s.pendingEvent; i++) maybeFireEvent(c, s, 0);
    expect(s.pendingEvent).not.toBeNull();
    const d = decide(c, s, 0);
    expect(d.action.type).toBe('EVENT_CHOICE');
    expect((d.action as { choice: number }).choice).toBe(1);
  });
});

describe('event catalog', () => {
  it('ships a varied catalog (ambient + interactive) that validates', () => {
    const evs = Object.values(STANDARD_RULESET.events);
    expect(evs.length).toBeGreaterThanOrEqual(10);
    expect(evs.some((e) => e.choices.length === 1)).toBe(true);  // ambient
    expect(evs.some((e) => e.choices.length >= 2)).toBe(true);   // interactive
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });
});

describe('chronicle', () => {
  it('records chronicle-worthy events (city founded, wonder) but not chatter', () => {
    let s = flatWorld(16, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    expect(s.chronicle.some((e) => e.type === 'cityFounded')).toBe(true);
    // a mundane improvement-completed event is not chronicled
    expect(s.chronicle.some((e) => e.type === 'improvement')).toBe(false);
  });
  it('records resolved events', () => {
    const c = customCtx((r) => {
      r.events.test_amb = { id: 'test_amb', title: 'Good Tidings', body: '...', choices: [{ text: 'ok', effects: [{ k: 'gold', n: 5 }] }] };
    });
    const s = oneCity(c);
    for (let i = 0; i < 200; i++) { maybeFireEvent(c, s, 0); if (s.chronicle.some((e) => e.type === 'eventChronicle')) break; }
    expect(s.chronicle.some((e) => e.type === 'eventChronicle')).toBe(true);
  });
});
