# Living World — Plan 3: Events & Chronicle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic **event deck** — interactive choice events (a modal: pick A/B/C, each with consequences) plus ambient events that fire and resolve on their own — and a persistent **Chronicle** that records the story of the game. The single biggest "something happened I didn't cause" injector, and the spine of "contained."

**Architecture:** Events are pure ruleset data (`events.ts`): each has eligibility gates + `choices[]`, each choice a bounded list of instantaneous `EventEffect`s. At a player's turn-start (`beginTurn`), `maybeFireEvent` gathers eligible events (sorted), rolls via the in-state RNG (`drawInt`), and fires one. An event with ≤1 choice is **ambient** (auto-applies). An event with ≥2 choices sets `state.pendingEvent`; the human resolves it via a modal that dispatches a logged `EVENT_CHOICE` action; the AI resolves it as a pure function in `decide()` (also a logged action). A `validateAction` guard blocks all other actions until the event is resolved. The **Chronicle** is an append-only `state.chronicle[]` populated centrally inside `pushEvent` for chronicle-worthy event types — so existing milestone events (city founded, wonder, war, religion) flow in for free.

**Determinism:** event selection draws from `state.rngState` inside the reducer (`beginTurn`); candidate iteration is sorted; AI choice is a pure function; the human choice is a logged action. Replays reproduce. Because events add new RNG draws and change AI/economy trajectories, **self-play victory seeds will shift and must be re-tuned** (the established pattern — Task 8).

**Schema bump 7 → 8** (new state: `pendingEvent`, `chronicle`, `firedEvents`).

**Tech Stack:** TypeScript, Vitest, React. Verify with `npm test` / `npm run build`; tune with `npm run sim`.

**Spec:** `docs/superpowers/specs/2026-06-16-living-world-design.md` §4.4 (events), §5 (chronicle), §7 (UI). NOTE: the spec's cross-rival "opinion memory" event effect and the general `opinions[]` model are **deferred** — v1 event effects are player/capital-local and instantaneous (keeps the plan tractable and the diplomacy model untouched).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/data/types.ts` | Ruleset types | +`EventEffect`, `EventChoice`, `EventDef`; +`events` on `Ruleset` |
| `src/data/standard/events.ts` | **new** | ~12 event defs (ambient + interactive) |
| `src/data/standard/index.ts` | Ruleset assembly | wire `events` |
| `src/data/validate.ts` | Validation | event choices non-empty; `unit` effects reference real units |
| `src/engine/types.ts` | State types | +`EVENT_CHOICE` action; +`pendingEvent`/`chronicle`/`firedEvents` on `GameState`; +`ChronicleEntry` |
| `src/engine/serialize.ts` | Schema | `SCHEMA_VERSION` 7 → 8 |
| `src/engine/state.ts` | Init | `pendingEvent: null, chronicle: [], firedEvents: []` |
| `src/engine/events.ts` | Chronicle sink | `pushEvent` appends chronicle-worthy events to `state.chronicle` |
| `src/engine/systems/worldevents.ts` | **new** | `maybeFireEvent`, `applyEventEffects`, `eventChoiceValue` |
| `src/engine/systems/turn.ts` | Turn-start | call `maybeFireEvent` in `beginTurn` |
| `src/engine/reducer.ts` | Mutation | `EVENT_CHOICE` handler |
| `src/engine/validate.ts` | Gate | `EVENT_CHOICE` validation + pending-event action guard |
| `src/ai/decide.ts` | AI | resolve a pending event → `EVENT_CHOICE` |
| `src/app/driver.ts` | Toasts | `eventChronicle` in `TOAST_TYPES` |
| `src/ui/panels/Modals.tsx` | UI | **new** `EventModal` |
| `src/ui/panels/Chronicle.tsx` | UI | **new** chronicle overlay |
| `src/ui/GameScreen.tsx` | UI mount | mount `EventModal` + `Chronicle`; `KeyH` shortcut |
| `src/ui/panels/HudRight.tsx` | UI | Chronicle button; `event` turn-gate label |
| `src/app/store.ts` | UI state | `'chronicle'` overlay |
| `src/ui/actions.ts` | Turn gate | `event` gate (blocks end-turn while pending) |
| `tests/helpers.ts` | Fixtures | `flatWorld` gets `pendingEvent`/`chronicle`/`firedEvents` |
| `tests/events.test.ts` | **new** | firing, gating, choice, AI resolve, chronicle, determinism |

---

### Task 1: Data + state + schema

**Files:** `src/data/types.ts`, `src/engine/types.ts`, `src/engine/serialize.ts`, `src/engine/state.ts`, `tests/helpers.ts`, `src/data/standard/index.ts`, `src/data/validate.ts`. Test: `tests/events.test.ts` (new).

- [ ] **Step 1: Ruleset types** — in `src/data/types.ts`, add before `CivDef`:

```ts
/** A one-shot, integer, player/capital-local event effect. */
export type EventEffect =
  | { k: 'gold'; n: number }
  | { k: 'science'; n: number }
  | { k: 'faith'; n: number }
  | { k: 'culture'; n: number }
  | { k: 'production'; n: number }   // toward the capital's current build
  | { k: 'popChange'; n: number }    // capital population (floored at 1)
  | { k: 'unit'; unit: string }      // spawn a unit at/near the capital
  | { k: 'reveal'; radius: number }; // explore tiles around the capital
export interface EventChoice { text: string; effects: EventEffect[]; aiBias?: number; }
export interface EventDef {
  id: string; title: string; body: string;
  minTurn?: number; requiresPop?: number; oncePerGame?: boolean;
  choices: EventChoice[]; // length<=1 = ambient (auto-resolves); >=2 = interactive (modal)
}
```

Add to `Ruleset` (after `agendas: Record<string, AgendaDef>;`):

```ts
  events: Record<string, EventDef>;
```

- [ ] **Step 2: State types** — in `src/engine/types.ts`:
  - Add to the `Action` union (after the `CHOOSE_PROMOTION` line, before `END_TURN`):
    ```ts
      | { type: 'EVENT_CHOICE'; player: PlayerId; choice: number }
    ```
  - Add a `ChronicleEntry` interface (near `GameEvent`):
    ```ts
    export interface ChronicleEntry { turn: number; type: string; msg: string; q?: number; r?: number; }
    ```
  - Add to `GameState` (after `winner: ...`):
    ```ts
      pendingEvent: { player: PlayerId; eventId: string } | null;
      chronicle: ChronicleEntry[];
      firedEvents: string[]; // ids of oncePerGame events already used
    ```

- [ ] **Step 3: Schema** — `src/engine/serialize.ts`: `export const SCHEMA_VERSION = 8;`

- [ ] **Step 4: Init** — `src/engine/state.ts`, in the `state` object literal (after `winner: null,`):
    ```ts
    pendingEvent: null,
    chronicle: [],
    firedEvents: [],
    ```

- [ ] **Step 5: Fixtures** — `tests/helpers.ts`, in `flatWorld`'s returned object (after `winner: null,`):
    ```ts
    pendingEvent: null,
    chronicle: [],
    firedEvents: [],
    ```

- [ ] **Step 6: Wire + validate** — in `src/data/standard/index.ts`, import `EVENTS` from `'./events'` and add `events: EVENTS,` to `STANDARD_RULESET` (after `agendas: AGENDAS,`). Create `src/data/standard/events.ts` with an empty catalog for now (Task 7 fills it):
    ```ts
    import type { EventDef } from '../types';
    export const EVENTS: Record<string, EventDef> = {};
    ```
  In `src/data/validate.ts`, before `return errors;`:
    ```ts
    for (const ev of Object.values(rules.events)) {
      if (ev.choices.length === 0) errors.push(`event ${ev.id}: needs at least one choice`);
      for (const ch of ev.choices)
        for (const eff of ch.effects)
          if (eff.k === 'unit' && !(eff.unit in rules.units))
            errors.push(`event ${ev.id}: unknown unit ${eff.unit}`);
    }
    ```

- [ ] **Step 7: Write the failing test** — create `tests/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { initialState } from '../src/engine/state';
import { ctx } from './helpers';

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
```

- [ ] **Step 8: Run + commit.** `npx vitest run tests/events.test.ts` (PASS), `npx tsc -b` (clean).
```bash
git add src/data/types.ts src/data/standard/events.ts src/data/standard/index.ts src/data/validate.ts src/engine/types.ts src/engine/serialize.ts src/engine/state.ts tests/helpers.ts tests/events.test.ts
git commit -m "feat(engine): schema 8 — event-deck types, pendingEvent/chronicle/firedEvents state"
```

---

### Task 2: Effect application + firing engine

**Files:** Create `src/engine/systems/worldevents.ts`; modify `src/engine/systems/turn.ts`. Test: `tests/events.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `tests/events.test.ts`:

```ts
import { customCtx, flatWorld, spawn, refreshVis, thaw } from './helpers';
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
```

- [ ] **Step 2: Run — expect FAIL** (`worldevents` doesn't exist). `npx vitest run tests/events.test.ts -t "events: effects"`.

- [ ] **Step 3: Create `src/engine/systems/worldevents.ts`:**

```ts
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
      case 'production': if (cap) cap.production.progress = Math.max(0, cap.production.progress + e.n); break;
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
  if (state.pendingEvent) return;
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
```

- [ ] **Step 4: Hook into `beginTurn`** — in `src/engine/systems/turn.ts`, add the import `import { maybeFireEvent } from './worldevents';` and, in `beginTurn`, insert just before the `// 4. fresh eyes` comment:

```ts
  // 3d. the world acts: maybe a world event befalls this player
  maybeFireEvent(ctx, state, pid);

```

- [ ] **Step 5: Run + commit.** `npx vitest run tests/events.test.ts` (PASS). `npx tsc -b`.
```bash
git add src/engine/systems/worldevents.ts src/engine/systems/turn.ts tests/events.test.ts
git commit -m "feat(engine): deterministic event deck — firing, effects, ambient auto-resolve"
```

---

### Task 3: EVENT_CHOICE action + pending-event guard

**Files:** `src/engine/reducer.ts`, `src/engine/validate.ts`. Test: `tests/events.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `tests/events.test.ts`:

```ts
import { validateAction } from '../src/engine/validate';

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
}
);
```

- [ ] **Step 2: Run — expect FAIL** (EVENT_CHOICE unhandled). `npx vitest run tests/events.test.ts -t "EVENT_CHOICE"`.

- [ ] **Step 3: Reducer** — in `src/engine/reducer.ts`, import `applyEventEffects`: add `import { applyEventEffects } from './systems/worldevents';`. Add a case before `case 'END_TURN': {`:

```ts
    case 'EVENT_CHOICE': {
      const pe = state.pendingEvent;
      if (pe) {
        const ev = ctx.rules.events[pe.eventId];
        const choice = ev?.choices[action.choice];
        if (choice) applyEventEffects(ctx, state, action.player, choice.effects);
        if (ev) pushEvent(state, { player: action.player, type: 'eventChronicle', msg: `${state.players[action.player].name}: ${ev.title} — ${choice?.text ?? ''}` });
        state.pendingEvent = null;
      }
      break;
    }
```

- [ ] **Step 4: Validate** — in `src/engine/validate.ts`, add the pending-event guard immediately after `if (action.player !== state.currentPlayer) return fail('not your turn');`:

```ts
  if (state.pendingEvent && state.pendingEvent.player === action.player && action.type !== 'EVENT_CHOICE')
    return fail('resolve the event first');
```

Add the `EVENT_CHOICE` case in the `switch` (after the `CHOOSE_PROMOTION` case):

```ts
    case 'EVENT_CHOICE': {
      const pe = state.pendingEvent;
      if (!pe || pe.player !== action.player) return fail('no pending event');
      const ev = ctx.rules.events[pe.eventId];
      if (!ev) return fail('unknown event');
      if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= ev.choices.length)
        return fail('invalid choice');
      return ok;
    }
```

- [ ] **Step 5: Run + commit.** `npx vitest run tests/events.test.ts` (PASS). `npx tsc -b`.
```bash
git add src/engine/reducer.ts src/engine/validate.ts tests/events.test.ts
git commit -m "feat(engine): EVENT_CHOICE action resolves a pending event; guard blocks other actions"
```

---

### Task 4: AI resolves pending events

**Files:** `src/ai/decide.ts`. Test: `tests/events.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `tests/events.test.ts`:

```ts
import { decide } from '../src/ai/decide';

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
```

- [ ] **Step 2: Run — expect FAIL** (AI doesn't handle pending). `npx vitest run tests/events.test.ts -t "AI resolution"`.

- [ ] **Step 3: Implement** — in `src/ai/decide.ts`, import `eventChoiceValue` from `'../engine/systems/worldevents'`. In `decide`, immediately after `if (state.players[pid].barbarian) return barbarianDecide(ctx, state, pid);`, add:

```ts
  // resolve a pending world event before anything else (a logged, pure choice)
  if (state.pendingEvent && state.pendingEvent.player === pid) {
    const ev = ctx.rules.events[state.pendingEvent.eventId];
    if (ev) {
      let best = 0, bestVal = -Infinity;
      for (let i = 0; i < ev.choices.length; i++) {
        const val = eventChoiceValue(ev.choices[i]);
        if (val > bestVal) { bestVal = val; best = i; }
      }
      return { action: { type: 'EVENT_CHOICE', player: pid, choice: best }, reason: `${ev.title}: ${ev.choices[best].text}` };
    }
  }
```

- [ ] **Step 4: Run + commit.** `npx vitest run tests/events.test.ts` (PASS).
```bash
git add src/ai/decide.ts tests/events.test.ts
git commit -m "feat(ai): resolve a pending world event by choice utility"
```

---

### Task 5: Chronicle

**Files:** `src/engine/events.ts`. Test: `tests/events.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `tests/events.test.ts`:

```ts
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
    for (let i = 0; i < 200; i++) maybeFireEvent(c, s, 0);
    expect(s.chronicle.some((e) => e.type === 'eventChronicle')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (no chronicle population). `npx vitest run tests/events.test.ts -t "chronicle"`.

- [ ] **Step 3: Implement** — replace `src/engine/events.ts` with:

```ts
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
  if (CHRONICLE_TYPES.has(ev.type)) state.chronicle.push({ turn: state.turn, type: ev.type, msg: ev.msg, q: ev.q, r: ev.r });
}
```

(Note: `religionFounded`/`cityCaptured` etc. are existing event types pushed elsewhere; this routes them to the chronicle with no call-site changes. If `state.chronicle` could be undefined on a malformed state, guard with `state.chronicle?.push` — but schema 8 guarantees it.)

- [ ] **Step 4: Run + commit.** `npx vitest run tests/events.test.ts` (PASS).
```bash
git add src/engine/events.ts tests/events.test.ts
git commit -m "feat(engine): Chronicle — pushEvent records chronicle-worthy moments"
```

---

### Task 6: UI — event modal, chronicle overlay, turn gate

**Files:** `src/app/store.ts`, `src/ui/actions.ts`, `src/ui/panels/Modals.tsx`, `src/ui/panels/Chronicle.tsx` (new), `src/ui/GameScreen.tsx`, `src/ui/panels/HudRight.tsx`, `src/app/driver.ts`. (UI; verified by type-check/build + manual.)

- [ ] **Step 1: Store overlay** — in `src/app/store.ts`, change the `overlay` field type to include chronicle:
```ts
  overlay: 'tech' | 'menu' | 'diplomacy' | 'civics' | 'chronicle' | null;
```

- [ ] **Step 2: Turn gate** — in `src/ui/actions.ts`:
  - Add to the `TurnGate` union: `| { kind: 'event' }` (as the first member).
  - In `turnGate()`, add as the FIRST check (after `if (!game) return { kind: 'ready' };`):
    ```ts
      if (game.pendingEvent && game.pendingEvent.player === viewingPlayer) return { kind: 'event' };
    ```
  - In `endTurnRequest()`'s switch, add a no-op case (the modal handles resolution):
    ```ts
        case 'event':
          return; // the event modal is up; the player must choose
    ```

- [ ] **Step 3: Driver toast** — in `src/app/driver.ts`, add `'eventChronicle',` to `TOAST_TYPES` (so ambient/resolved events toast).

- [ ] **Step 4: EventModal** — append to `src/ui/panels/Modals.tsx`:

```tsx
function eventEffectSummary(effects: { k: string; n?: number; unit?: string; radius?: number }[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    if (e.k === 'gold') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} gold`);
    else if (e.k === 'science') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} science`);
    else if (e.k === 'faith') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} faith`);
    else if (e.k === 'culture') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} culture`);
    else if (e.k === 'production') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} production`);
    else if (e.k === 'popChange') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} population`);
    else if (e.k === 'unit') parts.push(`a ${gameCtx.rules.units[e.unit!]?.name ?? e.unit}`);
    else if (e.k === 'reveal') parts.push('reveal nearby lands');
  }
  return parts.join(', ') || 'nothing';
}

export function EventModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game || !game.pendingEvent || game.pendingEvent.player !== viewer) return null;
  const ev = gameCtx.rules.events[game.pendingEvent.eventId];
  if (!ev) return null;
  return (
    <div className="modal-center">
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>{ev.title}</h2>
        <p>{ev.body}</p>
        <div className="modal-actions" style={{ flexDirection: 'column' }}>
          {ev.choices.map((c, i) => (
            <button key={i} className="btn btn--primary" onClick={() => humanDispatch({ type: 'EVENT_CHOICE', player: viewer, choice: i })}>
              {c.text}
              <span className="sub">{eventEffectSummary(c.effects)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Chronicle overlay** — create `src/ui/panels/Chronicle.tsx`:

```tsx
import { appStore, focusCamera, useApp } from '../../app/store';

export function Chronicle() {
  const game = useApp((s) => s.game);
  if (!game) return null;
  const close = () => appStore.set({ overlay: null });
  const entries = [...game.chronicle].reverse();
  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="diplo" onClick={(e) => e.stopPropagation()}>
        <div className="tech-head">
          <h2>CHRONICLE</h2>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Close (Esc)</button>
        </div>
        <div className="diplo-body scroll-quiet">
          {entries.length === 0 && <div className="muted">The age is young; no deeds yet recorded.</div>}
          {entries.map((e, i) => (
            <div
              key={i}
              className="chron-row"
              style={{ padding: '4px 2px', borderBottom: '1px solid rgba(200,165,91,0.12)', cursor: e.q !== undefined ? 'pointer' : 'default' }}
              onClick={() => { if (e.q !== undefined && e.r !== undefined) { focusCamera(e.q, e.r); close(); } }}
            >
              <span className="muted" style={{ fontSize: 11 }}>Turn {e.turn}</span> · {e.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Mount + shortcut** — in `src/ui/GameScreen.tsx`:
  - Import: `import { Chronicle } from './panels/Chronicle';` and add `EventModal` to the existing Modals import (`import { AiThinkingBanner, EventModal, GameMenu, ProposalModal, ReligionModal, TradeRouteModal, VictoryOverlay, WarConfirm } from './panels/Modals';`).
  - Add a `KeyH` case to the keyboard switch (next to `KeyC`):
    ```ts
        case 'KeyH':
          appStore.set({ overlay: ov === 'chronicle' ? null : 'chronicle' });
          break;
    ```
  - In the render, add `{overlay === 'chronicle' && <Chronicle />}` (next to the other overlay lines) and `<EventModal />` (next to the other modals, e.g., before `<VictoryOverlay />`).

- [ ] **Step 7: HudRight** — in `src/ui/panels/HudRight.tsx`:
  - Add the `event` gate label: in the `if/else` chain, add as the first branch after `if (!myTurn) {...}`:
    ```ts
      } else if (gate?.kind === 'event') {
        label = 'An Event Awaits';
        sub = 'a decision is needed';
    ```
  - Add a Chronicle button: import `appStore` (add it to the existing `import { focusCamera, useApp } from '../../app/store';` → `import { appStore, focusCamera, useApp } from '../../app/store';`), and add before `<Minimap />` in the returned JSX:
    ```tsx
        <div className="end-turn" style={{ fontSize: 13 }} onClick={() => appStore.set({ overlay: 'chronicle' })} title="Chronicle (H)">Chronicle</div>
    ```

- [ ] **Step 8: Verify** — `npx tsc -b` clean; `npm run build` clean. Run `node scripts/shot.mjs` if available and confirm no console errors (manual: trigger an event by playing a few turns; confirm the modal appears and the Chronicle lists founding/war/etc.).

- [ ] **Step 9: Commit.**
```bash
git add src/app/store.ts src/ui/actions.ts src/app/driver.ts src/ui/panels/Modals.tsx src/ui/panels/Chronicle.tsx src/ui/GameScreen.tsx src/ui/panels/HudRight.tsx
git commit -m "feat(ui): event modal, chronicle overlay, and event turn-gate"
```

---

### Task 7: The event catalog (~12 events)

**Files:** `src/data/standard/events.ts`. Test: `tests/events.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `tests/events.test.ts`:

```ts
describe('event catalog', () => {
  it('ships a varied catalog (ambient + interactive) that validates', () => {
    const evs = Object.values(STANDARD_RULESET.events);
    expect(evs.length).toBeGreaterThanOrEqual(10);
    expect(evs.some((e) => e.choices.length === 1)).toBe(true);  // ambient
    expect(evs.some((e) => e.choices.length >= 2)).toBe(true);   // interactive
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (empty catalog). `npx vitest run tests/events.test.ts -t "event catalog"`.

- [ ] **Step 3: Fill `src/data/standard/events.ts`:**

```ts
import type { EventDef } from '../types';

export const EVENTS: Record<string, EventDef> = {
  bountiful_harvest: { id: 'bountiful_harvest', title: 'Bountiful Harvest', body: 'The fields yield more than anyone can remember.', minTurn: 4, requiresPop: 2,
    choices: [{ text: 'Give thanks', effects: [{ k: 'culture', n: 8 }] }] },
  good_omen: { id: 'good_omen', title: 'An Omen in the Sky', body: 'The priests read fortune in the heavens.', minTurn: 4,
    choices: [{ text: 'Take heart', effects: [{ k: 'faith', n: 10 }] }] },
  bumper_trade: { id: 'bumper_trade', title: 'Caravans of Plenty', body: 'Foreign traders bring a windfall of coin.', minTurn: 8,
    choices: [{ text: 'Fill the coffers', effects: [{ k: 'gold', n: 25 }] }] },
  plague: { id: 'plague', title: 'A Wasting Sickness', body: 'Fever sweeps the crowded streets.', minTurn: 30, requiresPop: 5,
    choices: [{ text: 'Endure it', effects: [{ k: 'popChange', n: -1 }] }] },
  explorers_return: { id: 'explorers_return', title: 'Wanderers Return', body: 'Travelers bring maps of distant country.', minTurn: 6,
    choices: [{ text: 'Hear their tales', effects: [{ k: 'reveal', radius: 4 }] }] },
  migrants: { id: 'migrants', title: 'Migrants at the Gate', body: 'Families seek refuge within your walls.', minTurn: 15,
    choices: [
      { text: 'Welcome them', effects: [{ k: 'popChange', n: 1 }], aiBias: 4 },
      { text: 'Send them on with alms', effects: [{ k: 'gold', n: 25 }] },
    ] },
  mineral_strike: { id: 'mineral_strike', title: 'A Rich Seam', body: 'Miners strike a vein in the hills.', minTurn: 10,
    choices: [
      { text: 'Invest in the works', effects: [{ k: 'production', n: 15 }] },
      { text: 'Sell the rights', effects: [{ k: 'gold', n: 40 }] },
    ] },
  wandering_scholar: { id: 'wandering_scholar', title: 'A Wandering Scholar', body: 'A learned traveler offers to stay.', minTurn: 18,
    choices: [
      { text: 'Host them at court', effects: [{ k: 'science', n: 25 }], aiBias: 3 },
      { text: 'Send them away', effects: [] },
    ] },
  festival: { id: 'festival', title: 'Call for a Festival', body: 'The people long to celebrate.', minTurn: 12, requiresPop: 4,
    choices: [
      { text: 'Spare no expense', effects: [{ k: 'culture', n: 18 }, { k: 'gold', n: -20 }] },
      { text: 'A modest affair', effects: [{ k: 'culture', n: 5 }] },
    ] },
  pilgrims: { id: 'pilgrims', title: 'Pilgrims Arrive', body: 'The faithful gather at your temples.', minTurn: 15,
    choices: [
      { text: 'Bless them', effects: [{ k: 'faith', n: 20 }], aiBias: 2 },
      { text: 'Levy a toll', effects: [{ k: 'gold', n: 25 }] },
    ] },
  volunteer_militia: { id: 'volunteer_militia', title: 'Volunteers Muster', body: 'Young men clamor to take up arms.', minTurn: 20,
    choices: [
      { text: 'Arm them', effects: [{ k: 'unit', unit: 'warrior' }] },
      { text: 'Send them home with coin', effects: [{ k: 'gold', n: 20 }] },
    ] },
  ancient_ruins: { id: 'ancient_ruins', title: 'Ruins of the Ancients', body: 'Explorers uncover a forgotten city.', minTurn: 8, oncePerGame: true,
    choices: [
      { text: 'Study the relics', effects: [{ k: 'science', n: 30 }], aiBias: 3 },
      { text: 'Strip them for gold', effects: [{ k: 'gold', n: 40 }] },
    ] },
};
```

- [ ] **Step 4: Run + commit.** `npx vitest run tests/events.test.ts` (PASS).
```bash
git add src/data/standard/events.ts tests/events.test.ts
git commit -m "feat(data): a 12-event v1 catalog (ambient + interactive)"
```

---

### Task 8: Full-suite verification, self-play re-tune, determinism

**Files:** `tests/selfplay.test.ts` (re-seed if needed), possibly `tests/replay.test.ts` (no change expected).

- [ ] **Step 1: Full suite.** `npm test`. Events add RNG draws in `beginTurn` and change AI/economy trajectories, so `tests/selfplay.test.ts` victory-seed assertions will likely shift. For each failure: read what the seed now does and **re-seed** (scan nearby seeds for one that still yields the asserted victory type at a comparable turn; update with a comment noting "event deck shifted the RNG stream / AI trajectory"). Do NOT weaken assertions. Expect to iterate 1–2 times.

- [ ] **Step 2: Determinism.** `npx vitest run tests/replay.test.ts` must pass — events draw from `state.rngState` in the reducer and AI/human choices are logged actions, so replays reproduce. If replay fails, find the nondeterminism (unsorted candidate iteration, RNG outside the reducer, `Date`/`Math.random`) and fix it — do not re-record.

- [ ] **Step 3: Self-play telemetry.** Optionally extend `tests/selfplay.test.ts` to assert events fire and the chronicle is non-empty across a full game:
```ts
  // inside the existing full-game self-play test, after the game ends:
  expect(finalState.chronicle.length).toBeGreaterThan(0);
```
Run `npm run sim` and confirm it completes and that events fire (the chronicle grows).

- [ ] **Step 4: Build + screenshots.** `npm run build` clean. `node scripts/shot.mjs` (if present) — sanity that the UI renders.

- [ ] **Step 5: Commit any re-seed.**
```bash
git commit -am "test: re-tune self-play seeds for the event deck; assert chronicle populates" || echo "nothing to commit"
```

---

## Self-review (spec coverage / placeholders / type consistency)

- **Event deck (choice + ambient), deterministic** → Tasks 1–2 (types/state/firing), 3 (EVENT_CHOICE), 4 (AI). ✓
- **Chronicle** → Task 5 (central `pushEvent` sink) + Task 6 (overlay). ✓
- **UI (modal, chronicle, gate)** → Task 6. ✓
- **Catalog** → Task 7 (12 events, ambient + interactive). ✓
- **Determinism** → RNG via `drawInt` in the reducer; sorted candidates; AI pure; human logged; replay verified Task 8; self-play re-seeded. ✓
- **Schema 7→8** → Task 1. ✓
- **Deferred (noted):** cross-rival "opinion memory" event effects and the general `opinions[]` model (the spec's §4.3 + the part of §4.4 that writes rival memories) — v1 effects are player/capital-local. A future "event diplomacy" mini-track can add an `opinion`/`grudge` effect and the opinions[] model.
- **Placeholder scan:** none — all code is concrete. (Task 6 inline styles are intentional, to avoid a CSS dependency; `chron-row`/`leader-traits` can get real CSS later.)
- **Type consistency:** `EventEffect` kinds, `EventDef`/`EventChoice`, `pendingEvent`/`chronicle`/`firedEvents`, `maybeFireEvent`/`applyEventEffects`/`eventChoiceValue`, the `EVENT_CHOICE` action shape (`choice: number`), and `eventChronicle`/`eventChoice` event types are used identically across engine, AI, UI, and tests. ✓
