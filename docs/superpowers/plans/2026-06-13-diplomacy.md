# Diplomacy v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deal-making diplomacy — make peace, open borders, friendship, denounce, and a negotiation table trading peace · lump gold · gold-per-turn · open borders — with a deterministic, self-explaining AI that values, accepts/rejects/counters, and initiates proposals, surfaced in a full-screen Foreign Affairs council.

**Architecture:** A new system added the project's standard way (PLAN.md §2): a state slice + actions + reducer handlers + pure engine read-model (`attitude`, `valueDeal`) + an AI decision layer + UI. The durable relationship matrix is enriched in place; pending proposals are a transient list. All balance lives in ruleset data. All mutation flows through `validate` + `reduce`; the model functions are pure integer math so the UI verdict matches the AI exactly and replays stay bit-identical.

**Tech Stack:** TypeScript, Immer (reducer), Vitest (tests), React + Canvas (UI). Spec: `docs/superpowers/specs/2026-06-13-diplomacy-design.md`.

**Conventions for every task below:** run `npx tsc --noEmit` must stay clean; run `npx vitest run` for tests; commit messages are plain (no AI attribution). Phases are ordered; do not start a phase until the prior one's suite is green.

---

## File Structure

**New files**
- `src/engine/diplomacy-eval.ts` — pure `attitude()` and `valueDeal()` (the data-driven diplomacy model; no decisions). Used by both AI and UI.
- `src/engine/systems/diplomacy.ts` — deal application, denounce, obligation processing, proposal lifecycle (engine mutations called by the reducer/turn loop).
- `src/ai/diplomacy.ts` — decisions only: `respondToProposal`, `initiateProposals`.
- `src/ui/diplomacy.ts` — UI helpers: verdict line (via engine `valueDeal`), attitude colors, draft-deal types.
- `src/ui/panels/ForeignAffairs.tsx` — full-screen council overlay + deal table.
- `tests/diplomacy.test.ts` — unit coverage for the system.

**Modified files**
- `src/data/types.ts` — `DiplomacySettings`, `AttitudeBand`; extend `RulesetSettings`.
- `src/data/standard/index.ts` — `diplomacy` settings block.
- `src/engine/types.ts` — `RelationState`, `DealItems`, `Proposal`, `blankRelation`; `GameState` fields; 3 new `Action` variants.
- `src/engine/serialize.ts` — `SCHEMA_VERSION = 2`.
- `src/engine/state.ts` — build `RelationState` matrix; init `proposals`, `nextProposalId`.
- `src/engine/selectors.ts` — `atWar` reads `.status`; add `hasMet`, `metPlayers`, `canEnterForeignTile`.
- `src/engine/map/pathfind.ts` — open-borders-aware border check.
- `src/engine/map/visibility.ts` — set `met` on first sight.
- `src/engine/systems/turn.ts` — process obligations + expire/decay in `beginTurn`.
- `src/engine/systems/combat.ts` — grudge bump on city capture.
- `src/engine/validate.ts` — validate the 3 new actions; extend `DECLARE_WAR`.
- `src/engine/reducer.ts` — handlers for the 3 new actions; extend `DECLARE_WAR`.
- `src/ai/decide.ts` — respond to pending proposals; initiate proposals; consult attitude in war.
- `src/ui/panels/TopBar.tsx` — "Powers" entry + pending-proposal badge.
- `src/ui/panels/Modals.tsx` — proposal accept/reject modal.
- `src/app/store.ts` — `'diplomacy'` overlay, `diploTarget`, `draftDeal`.
- `src/app/driver.ts` — surface pending proposals to the human.
- `src/ui/GameScreen.tsx` — mount ForeignAffairs; keybinding.
- `src/ui/app.css` — council, deal table, badges, proposal modal styles.
- `tests/helpers.ts` — `flatWorld`/`declareWarBetween` build `RelationState`.
- `tests/replay.test.ts`, `tests/selfplay.test.ts` — diplomacy coverage.

---

## Phase A — State, settings, schema (foundation)

Goal: the enriched relation matrix and new state exist; the whole existing suite stays green. No new behavior yet.

### Task A1: Diplomacy settings types

**Files:**
- Modify: `src/data/types.ts`

- [ ] **Step 1: Add the types** at the end of `src/data/types.ts`:

```ts
export type AttitudeBand = 'hostile' | 'wary' | 'neutral' | 'cordial' | 'friendly';

export interface DiplomacySettings {
  termLength: number; // turns an open-borders / gold-per-turn deal lasts
  goldPerTurnHorizon: number; // turns of gold-per-turn the AI values up front
  proposalTtl: number; // turns a pending proposal stays open
  grudgeOnWar: number; // grudge stamped on the victim when war is declared
  grudgeOnCapture: number; // extra grudge when a city is captured
  grudgeDecay: number; // grudge lost per turn
  attitude: {
    atWar: number;
    grudgePerPoint: number;
    denounced: number;
    friendship: number;
    borderFriction: number;
    favorableDeal: number;
    landCompetition: number;
    strongerRival: number;
    weakerRival: number;
    competitionRange: number; // tiles
  };
  bands: { friendly: number; cordial: number; neutral: number; wary: number }; // score >= → band; below wary = hostile
  acceptMargin: Record<AttitudeBand, number>; // AI accepts if netValueToRecipient >= margin[band]
  counterWindow: number; // AI counters when net is within [margin - counterWindow, margin)
  minFriendBand: AttitudeBand; // band at/above which the AI agrees to friendship
}
```

- [ ] **Step 2: Reference it from `RulesetSettings`** — add this field inside the `RulesetSettings` interface (after `startingUnits`):

```ts
  diplomacy: DiplomacySettings;
```

- [ ] **Step 3: Verify it type-checks structurally** (will fail until A2 fills the value)

Run: `npx tsc --noEmit`
Expected: FAIL — `Property 'diplomacy' is missing in type ... SETTINGS` in `src/data/standard/index.ts`. (This is expected; A2 fixes it.)

- [ ] **Step 4: Commit after A2** (A1 + A2 commit together since the type and its only value are a unit).

### Task A2: Standard diplomacy settings values

**Files:**
- Modify: `src/data/standard/index.ts`

- [ ] **Step 1: Add the block** inside the `SETTINGS` object (after `startingUnits: [...]`):

```ts
  diplomacy: {
    termLength: 30,
    goldPerTurnHorizon: 20,
    proposalTtl: 1,
    grudgeOnWar: 30,
    grudgeOnCapture: 20,
    grudgeDecay: 2,
    attitude: {
      atWar: -60,
      grudgePerPoint: -1,
      denounced: -25,
      friendship: 40,
      borderFriction: -15,
      favorableDeal: 15,
      landCompetition: -10,
      strongerRival: -10,
      weakerRival: 5,
      competitionRange: 4,
    },
    bands: { friendly: 40, cordial: 15, neutral: -15, wary: -40 },
    acceptMargin: { hostile: 40, wary: 20, neutral: 8, cordial: 0, friendly: -10 },
    counterWindow: 30,
    minFriendBand: 'cordial',
  },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/data/types.ts src/data/standard/index.ts
git commit -m "Add diplomacy ruleset settings"
```

### Task A3: Relation/deal/proposal types + state fields + schema bump

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/serialize.ts`

- [ ] **Step 1: Replace the `Relation` type** in `src/engine/types.ts`. Find:

```ts
export type Relation = 'peace' | 'war';
```

Replace with:

```ts
export interface RelationState {
  status: 'peace' | 'war'; // symmetric
  since: number; // turn status last changed (symmetric)
  met: boolean; // a and b have encountered each other (symmetric); sticky once true
  friends: boolean; // mutual declared friendship (symmetric)
  denounced: boolean; // a has denounced b (directional)
  openBordersUntil: number; // a grants b transit until this turn (0 = none; directional)
  goldPerTurn: number; // a pays b each turn (directional)
  goldUntil: number; // gold-per-turn runs until this turn (0 = none)
  grudge: number; // a's grudge toward b; decays each turn (directional)
}

export function blankRelation(): RelationState {
  return {
    status: 'peace',
    since: 1,
    met: false,
    friends: false,
    denounced: false,
    openBordersUntil: 0,
    goldPerTurn: 0,
    goldUntil: 0,
    grudge: 0,
  };
}

export interface DealItems {
  gold: number; // lump sum this side provides (0 = none)
  goldPerTurn?: { amount: number; turns: number };
  openBorders?: boolean; // this side grants the other transit
  peace?: boolean; // mutual (both sides set to end a war)
  friendship?: boolean; // mutual (both sides set)
}

export interface Proposal {
  id: number;
  from: PlayerId;
  to: PlayerId;
  give: DealItems; // what `from` provides
  take: DealItems; // what `from` asks of `to`
  expiresTurn: number;
}
```

- [ ] **Step 2: Update the `GameState.relations` field type** in the same file. Find `relations: Relation[][];` and replace with:

```ts
  relations: RelationState[][];
  proposals: Proposal[];
  nextProposalId: number;
```

- [ ] **Step 3: Add the new actions** to the `Action` union (after the `DECLARE_WAR` line):

```ts
  | { type: 'PROPOSE_DEAL'; player: PlayerId; to: PlayerId; give: DealItems; take: DealItems }
  | { type: 'RESPOND_DEAL'; player: PlayerId; proposal: number; accept: boolean }
  | { type: 'DENOUNCE'; player: PlayerId; target: PlayerId }
```

- [ ] **Step 4: Bump the schema** in `src/engine/serialize.ts`. Find `export const SCHEMA_VERSION = 1;` and change to:

```ts
export const SCHEMA_VERSION = 2;
```

- [ ] **Step 5: Type-check (expected failures point to the call sites A4 fixes)**

Run: `npx tsc --noEmit`
Expected: FAIL — errors in `state.ts`, `selectors.ts`, `reducer.ts`, `tests/helpers.ts` where `relations` is still treated as strings. A4 fixes all of them.

### Task A4: Migrate every relations call-site

**Files:**
- Modify: `src/engine/state.ts`
- Modify: `src/engine/selectors.ts:` (the `atWar` function)
- Modify: `src/engine/reducer.ts:` (the `DECLARE_WAR` case)
- Modify: `tests/helpers.ts`

- [ ] **Step 1: `state.ts` — build the matrix.** Find:

```ts
  const relations: Relation[][] = players.map(() => players.map(() => 'peace' as Relation));
```

Replace with:

```ts
  const relations: RelationState[][] = players.map(() => players.map(() => blankRelation()));
```

Update the import at the top of `state.ts` from `./types` to include `RelationState, blankRelation` (replace the existing `Relation` import token). Then find the `GameState` literal's `relations,` line and, right after it, add:

```ts
    proposals: [],
    nextProposalId: 1,
```

- [ ] **Step 2: `selectors.ts` — `atWar` reads `.status`.** Find:

```ts
export function atWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return a !== b && state.relations[a][b] === 'war';
}
```

Replace with:

```ts
export function atWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return a !== b && state.relations[a][b].status === 'war';
}
```

- [ ] **Step 3: `reducer.ts` — `DECLARE_WAR` sets `.status` (full extension comes in Phase B).** Find:

```ts
    case 'DECLARE_WAR': {
      state.relations[action.player][action.target] = 'war';
      state.relations[action.target][action.player] = 'war';
      pushEvent(state, {
```

Replace the two assignment lines with:

```ts
    case 'DECLARE_WAR': {
      state.relations[action.player][action.target].status = 'war';
      state.relations[action.target][action.player].status = 'war';
      state.relations[action.player][action.target].since = state.turn;
      state.relations[action.target][action.player].since = state.turn;
      pushEvent(state, {
```

- [ ] **Step 4: `tests/helpers.ts` — build `RelationState` and update `declareWarBetween`.** Find in `flatWorld`:

```ts
    relations: players.map(() => players.map(() => 'peace' as const)),
```

Replace with:

```ts
    relations: players.map(() => players.map(() => blankRelation())),
    proposals: [],
    nextProposalId: 1,
```

Add `blankRelation` to the import from `../src/engine/types`. Then find:

```ts
export function declareWarBetween(state: GameState, a: number, b: number): void {
  state.relations[a][b] = 'war';
  state.relations[b][a] = 'war';
}
```

Replace with:

```ts
export function declareWarBetween(state: GameState, a: number, b: number): void {
  state.relations[a][b].status = 'war';
  state.relations[b][a].status = 'war';
  state.relations[a][b].since = state.turn;
  state.relations[b][a].since = state.turn;
}
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — all 49 existing tests still green (relations now objects, behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/serialize.ts src/engine/state.ts src/engine/selectors.ts src/engine/reducer.ts tests/helpers.ts
git commit -m "Enrich relations into a directional state matrix; bump save schema to 2"
```

---

## Phase B — Diplomacy model & "met" flag (pure, unit-tested)

Goal: the pure read-model — `attitude`, `valueDeal`, `resolveProposal` — and the selectors/visibility they need. No actions yet; everything here is a pure function tested in isolation.

> **Plan-time refinement of the spec:** the spec sketched `respondToProposal` in `src/ai/`. To keep the engine self-contained and let a human→AI offer resolve *immediately* in the reducer (without the engine importing the AI layer), the deterministic *resolution* (`resolveProposal`: accept/reject/counter from `valueDeal` + margins) lives in the engine alongside `valueDeal`. The AI layer keeps only *initiation* policy (what to offer / when to denounce). This preserves the spec's intent (UI never imports AI; one shared deterministic model) and improves layering.

### Task B1: `met` flag on first sight

**Files:**
- Modify: `src/engine/map/visibility.ts`
- Test: `tests/diplomacy.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `tests/diplomacy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis } from './helpers';
import { hasMet } from '../src/engine/selectors';

describe('met flag', () => {
  it('is set when a unit sees a rival unit, and is sticky', () => {
    const s = flatWorld(12, 10, 2);
    spawn(s, 0, 'warrior', 4, 4);
    spawn(s, 1, 'warrior', 5, 4); // within sight of player 0's warrior
    refreshVis(s);
    expect(hasMet(s, 0, 1)).toBe(true);
    expect(hasMet(s, 1, 0)).toBe(true); // symmetric
  });

  it('stays unmet when far apart', () => {
    const s = flatWorld(20, 12, 2);
    spawn(s, 0, 'warrior', 2, 2);
    spawn(s, 1, 'warrior', 18, 10);
    refreshVis(s);
    expect(hasMet(s, 0, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — fails** (`hasMet` undefined)

Run: `npx vitest run tests/diplomacy.test.ts`
Expected: FAIL — `hasMet is not a function`.

- [ ] **Step 3: Add `hasMet`/`metPlayers` to `src/engine/selectors.ts`** (after `atWar`):

```ts
export function hasMet(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return a === b || state.relations[a][b].met;
}

export function metPlayers(state: GameState, viewer: PlayerId): PlayerId[] {
  return state.players
    .filter((p) => p.alive && p.id !== viewer && state.relations[viewer][p.id].met)
    .map((p) => p.id);
}
```

- [ ] **Step 4: Set `met` during visibility recompute** in `src/engine/map/visibility.ts`. At the end of `recomputeVisibility`, after the owned-territory loop, add a pass that marks any rival whose unit or city sits on a now-visible tile as met (symmetric):

```ts
  // first contact: meeting a rival's unit or city on a visible tile sets `met` both ways
  const mark = (other: PlayerId) => {
    if (other === player) return;
    state.relations[player][other].met = true;
    state.relations[other][player].met = true;
  };
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.owner === player) continue;
    if (vis[tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH)] === VIS_VISIBLE) mark(u.owner);
  }
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (c.owner === player) continue;
    if (vis[tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH)] === VIS_VISIBLE) mark(c.owner);
  }
```

Ensure `PlayerId` is imported in `visibility.ts` (it imports from `../types` already; add `PlayerId` to that import).

- [ ] **Step 5: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/selectors.ts src/engine/map/visibility.ts tests/diplomacy.test.ts
git commit -m "Track first contact (met) between civilizations"
```

### Task B2: Attitude model

**Files:**
- Create: `src/engine/diplomacy-eval.ts`
- Test: `tests/diplomacy.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/diplomacy.test.ts`:

```ts
import { attitude } from '../src/engine/diplomacy-eval';
import { declareWarBetween } from './helpers';

describe('attitude', () => {
  it('is neutral between two untouched, distant players at peace', () => {
    const s = flatWorld(20, 12, 2);
    const a = attitude(ctx, s, 1, 0);
    expect(a.band).toBe('neutral');
    expect(a.factors.every((f) => typeof f.label === 'string')).toBe(true);
  });

  it('war makes the band hostile and is reflected in the factors', () => {
    const s = flatWorld(20, 12, 2);
    declareWarBetween(s, 0, 1);
    s.relations[1][0].grudge = ctx.rules.settings.diplomacy.grudgeOnWar;
    const a = attitude(ctx, s, 1, 0);
    expect(a.band).toBe('hostile');
    expect(a.factors.some((f) => f.label.toLowerCase().includes('war'))).toBe(true);
  });

  it('mutual friendship lifts the band to at least cordial', () => {
    const s = flatWorld(20, 12, 2);
    s.relations[0][1].friends = true;
    s.relations[1][0].friends = true;
    const a = attitude(ctx, s, 1, 0);
    expect(['cordial', 'friendly']).toContain(a.band);
  });
});
```

- [ ] **Step 2: Run — fails** (`attitude` missing)

Run: `npx vitest run tests/diplomacy.test.ts`
Expected: FAIL — cannot import `attitude`.

- [ ] **Step 3: Create `src/engine/diplomacy-eval.ts`**:

```ts
/**
 * The pure, data-driven diplomacy model: how a player feels about another
 * (attitude) and what a proposed deal is worth to its recipient (valueDeal),
 * plus the deterministic accept/reject/counter resolution. Shared by the AI
 * decision layer and the UI verdict line so they never disagree. Integer math
 * only — same inputs, same answer, on every platform.
 */
import type { AttitudeBand } from '../data/types';
import type { Ctx, GameState, PlayerId, DealItems, Proposal } from './types';
import { sortedIds } from './types';
import { hexDistance, tileIndex, neighbors, axialOfIndex } from './hex';
import { atWar, militaryPower, playerCities, tileOwner } from './selectors';

export interface AttitudeFactor {
  label: string;
  delta: number;
}
export interface Attitude {
  score: number;
  band: AttitudeBand;
  factors: AttitudeFactor[];
}

function territoriesTouch(state: GameState, a: PlayerId, b: PlayerId): boolean {
  for (let i = 0; i < state.tiles.length; i++) {
    if (tileOwner(state, i) !== a) continue;
    for (const nb of neighbors(axialOfIndex(i, state.mapW))) {
      const j = tileIndex(nb, state.mapW, state.mapH);
      if (j >= 0 && tileOwner(state, j) === b) return true;
    }
  }
  return false;
}

function cityWithin(state: GameState, owner: PlayerId, near: PlayerId, range: number): boolean {
  const mine = playerCities(state, near);
  for (const c of playerCities(state, owner)) {
    for (const m of mine) {
      if (hexDistance({ q: c.q, r: c.r }, { q: m.q, r: m.r }) <= range) return true;
    }
  }
  return false;
}

function bandOf(ctx: Ctx, score: number): AttitudeBand {
  const b = ctx.rules.settings.diplomacy.bands;
  if (score >= b.friendly) return 'friendly';
  if (score >= b.cordial) return 'cordial';
  if (score >= b.neutral) return 'neutral';
  if (score >= b.wary) return 'wary';
  return 'hostile';
}

/** How `subject` feels about `toward`, with a reasoned factor breakdown. */
export function attitude(ctx: Ctx, state: GameState, subject: PlayerId, toward: PlayerId): Attitude {
  const d = ctx.rules.settings.diplomacy.attitude;
  const rel = state.relations[subject][toward];
  const back = state.relations[toward][subject];
  const factors: AttitudeFactor[] = [];
  const add = (label: string, delta: number) => {
    if (delta !== 0) factors.push({ label, delta });
  };

  if (rel.status === 'war') add('At war', d.atWar);
  if (rel.grudge > 0) add('Recent aggression', d.grudgePerPoint * rel.grudge);
  if (rel.denounced || back.denounced) add('Denouncement', d.denounced);
  if (rel.friends) add('Declared friendship', d.friendship);
  if (territoriesTouch(state, subject, toward)) add('Bordering territory', d.borderFriction);
  if (back.goldPerTurn > 0 || back.openBordersUntil >= state.turn) add('Favorable dealings', d.favorableDeal);
  if (cityWithin(state, toward, subject, d.competitionRange)) add('Crowding our lands', d.landCompetition);

  const myPower = militaryPower(ctx, state, subject);
  const theirPower = militaryPower(ctx, state, toward);
  if (theirPower > myPower * 1.5) add('Stronger than us', d.strongerRival);
  else if (myPower > theirPower * 1.5) add('Weaker than us', d.weakerRival);

  const score = factors.reduce((s, f) => s + f.delta, 0);
  return { score, band: bandOf(ctx, score), factors };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/diplomacy-eval.ts tests/diplomacy.test.ts
git commit -m "Add deterministic, explainable diplomacy attitude model"
```

### Task B3: Deal valuation & resolution

**Files:**
- Modify: `src/engine/diplomacy-eval.ts`
- Test: `tests/diplomacy.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/diplomacy.test.ts`:

```ts
import { valueDeal, resolveProposal } from '../src/engine/diplomacy-eval';
import type { Proposal } from '../src/engine/types';

const prop = (over: Partial<Proposal>): Proposal => ({
  id: 1, from: 0, to: 1, give: { gold: 0 }, take: { gold: 0 }, expiresTurn: 99, ...over,
});

describe('valueDeal', () => {
  it('values pure lump gold at face, from the recipient side', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    const p = prop({ give: { gold: 100 }, take: { gold: 0 } }); // player 0 gives 100 to player 1
    expect(valueDeal(ctx, s, 1, p)).toBe(100); // recipient (1) receives 100
    expect(valueDeal(ctx, s, 0, p)).toBe(-100); // giver (0) is down 100
  });

  it('values gold-per-turn over the horizon', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    const p = prop({ give: { gold: 0, goldPerTurn: { amount: 5, turns: 30 } }, take: { gold: 0 } });
    const h = ctx.rules.settings.diplomacy.goldPerTurnHorizon;
    expect(valueDeal(ctx, s, 1, p)).toBe(5 * h);
  });
});

describe('resolveProposal', () => {
  it('accepts a clearly favorable deal', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    const p = prop({ give: { gold: 200 }, take: { gold: 0 } }); // 0 gifts 1 → great for 1
    expect(resolveProposal(ctx, s, p, false).kind).toBe('accept');
  });

  it('rejects a one-sided demand from a neutral AI', () => {
    const s = flatWorld(20, 12, 2);
    s.players[1].gold = 500;
    const p = prop({ give: { gold: 0 }, take: { gold: 200 } }); // 0 demands 200 from 1 → bad for 1
    expect(resolveProposal(ctx, s, p, false).kind).toBe('reject');
  });

  it('counters a near-miss when allowed, demanding the gap in gold', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    // 0 offers 1 a small gift that is just under 1's neutral accept margin
    const margin = ctx.rules.settings.diplomacy.acceptMargin.neutral;
    const p = prop({ give: { gold: margin - 5 }, take: { gold: 0 } });
    const r = resolveProposal(ctx, s, p, true);
    expect(r.kind).toBe('counter');
    if (r.kind === 'counter') expect(r.take.gold).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/diplomacy.test.ts`
Expected: FAIL — `valueDeal`/`resolveProposal` missing.

- [ ] **Step 3: Append to `src/engine/diplomacy-eval.ts`**:

```ts
function sideValue(
  ctx: Ctx,
  state: GameState,
  owner: PlayerId,
  counterparty: PlayerId,
  items: DealItems,
  asReceiver: boolean,
): number {
  const d = ctx.rules.settings.diplomacy;
  let v = 0;
  v += items.gold; // face value
  if (items.goldPerTurn) v += items.goldPerTurn.amount * Math.min(items.goldPerTurn.turns, d.goldPerTurnHorizon);
  if (items.openBorders) {
    if (asReceiver) v += 20; // gaining passage into their land: minor convenience
    else {
      // granting passage costs more the less you trust them
      const band = attitude(ctx, state, owner, counterparty).band;
      v += band === 'hostile' ? 400 : band === 'wary' ? 120 : band === 'neutral' ? 40 : 15;
    }
  }
  if (items.peace) {
    // only meaningful at war; worth more to whoever is faring worse
    const mine = militaryPower(ctx, state, owner);
    const theirs = militaryPower(ctx, state, counterparty);
    v += Math.max(0, Math.floor((theirs - mine) / 2) + 20);
  }
  if (items.friendship) {
    const band = attitude(ctx, state, owner, counterparty).band;
    const order: AttitudeBand[] = ['hostile', 'wary', 'neutral', 'cordial', 'friendly'];
    v += order.indexOf(band) >= order.indexOf(d.minFriendBand) ? 30 : -1000; // gate: won't befriend below the bar
  }
  return v;
}

/** Net worth of a proposal to `recipient` = value(received) − value(given). */
export function valueDeal(ctx: Ctx, state: GameState, recipient: PlayerId, p: Proposal): number {
  const counterparty = recipient === p.to ? p.from : p.to;
  const received = recipient === p.to ? p.give : p.take;
  const given = recipient === p.to ? p.take : p.give;
  return (
    sideValue(ctx, state, recipient, counterparty, received, true) -
    sideValue(ctx, state, recipient, counterparty, given, false)
  );
}

export type Resolution =
  | { kind: 'accept' }
  | { kind: 'reject' }
  | { kind: 'counter'; give: DealItems; take: DealItems };

/** Decide how `p`'s recipient answers. `allowCounter` only when the proposer can respond (human). */
export function resolveProposal(ctx: Ctx, state: GameState, p: Proposal, allowCounter: boolean): Resolution {
  const d = ctx.rules.settings.diplomacy;
  const recipient = p.to;
  const band = attitude(ctx, state, recipient, p.from).band;
  const margin = d.acceptMargin[band];
  const net = valueDeal(ctx, state, recipient, p);
  if (net >= margin) return { kind: 'accept' };
  if (allowCounter && net >= margin - d.counterWindow) {
    const gap = margin - net; // demand the shortfall as extra lump gold from the proposer
    if (gap <= state.players[p.from].gold - p.take.gold) {
      return { kind: 'counter', give: { ...p.give }, take: { ...p.take, gold: p.take.gold + gap } };
    }
  }
  return { kind: 'reject' };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/diplomacy-eval.ts tests/diplomacy.test.ts
git commit -m "Add deal valuation and accept/reject/counter resolution"
```

---

## Phase C — Actions, deal application, obligations, borders

Goal: the 3 new actions + extended `DECLARE_WAR` are validated and reduced with full effects; gold-per-turn ticks and terms expire in the turn loop; open borders let units transit; capture stamps a grudge. Drive it all through `applyAction` in tests, plus a replay test.

### Task C1: Diplomacy mutation module

**Files:**
- Create: `src/engine/systems/diplomacy.ts`

- [ ] **Step 1: Create the module** (pure mutations on an Immer draft; no tests yet — C2/C3 exercise them):

```ts
/**
 * Engine-side diplomacy mutations: apply an accepted deal, enter war, denounce,
 * queue a proposal, and process per-turn obligations. Called by the reducer and
 * the turn loop. All operate on the (Immer draft) GameState in place.
 */
import type { Ctx, GameState, PlayerId, DealItems, Proposal } from '../types';
import { pushEvent } from '../events';

export function cancelPacts(state: GameState, a: PlayerId, b: PlayerId): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = state.relations[x][y];
    r.openBordersUntil = 0;
    r.goldPerTurn = 0;
    r.goldUntil = 0;
  }
}

export function enterWar(ctx: Ctx, state: GameState, a: PlayerId, b: PlayerId): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = state.relations[x][y];
    r.status = 'war';
    r.since = state.turn;
    r.friends = false;
  }
  cancelPacts(state, a, b);
  state.relations[b][a].grudge += ctx.rules.settings.diplomacy.grudgeOnWar;
  state.proposals = state.proposals.filter(
    (p) => !((p.from === a && p.to === b) || (p.from === b && p.to === a)),
  );
}

export function applyDeal(
  ctx: Ctx,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: DealItems,
  take: DealItems,
): void {
  const term = ctx.rules.settings.diplomacy.termLength;
  if (give.peace && take.peace) {
    for (const [x, y] of [[from, to], [to, from]] as const) {
      state.relations[x][y].status = 'peace';
      state.relations[x][y].since = state.turn;
    }
    cancelPacts(state, from, to);
  }
  if (give.friendship && take.friendship) {
    state.relations[from][to].friends = true;
    state.relations[to][from].friends = true;
  }
  if (give.gold > 0) {
    state.players[from].gold -= give.gold;
    state.players[to].gold += give.gold;
  }
  if (take.gold > 0) {
    state.players[to].gold -= take.gold;
    state.players[from].gold += take.gold;
  }
  if (give.goldPerTurn) {
    const r = state.relations[from][to];
    r.goldPerTurn = give.goldPerTurn.amount;
    r.goldUntil = state.turn + give.goldPerTurn.turns;
  }
  if (take.goldPerTurn) {
    const r = state.relations[to][from];
    r.goldPerTurn = take.goldPerTurn.amount;
    r.goldUntil = state.turn + take.goldPerTurn.turns;
  }
  if (give.openBorders) state.relations[from][to].openBordersUntil = state.turn + term;
  if (take.openBorders) state.relations[to][from].openBordersUntil = state.turn + term;
}

export function applyDenounce(ctx: Ctx, state: GameState, from: PlayerId, to: PlayerId): void {
  state.relations[from][to].denounced = true;
  if (state.relations[from][to].friends) {
    state.relations[from][to].friends = false;
    state.relations[to][from].friends = false;
  }
  state.relations[to][from].grudge += Math.floor(ctx.rules.settings.diplomacy.grudgeOnWar / 3);
  pushEvent(state, {
    player: null,
    type: 'denounce',
    msg: `${state.players[from].name} denounces ${state.players[to].name}`,
  });
}

export function pushProposal(
  ctx: Ctx,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: DealItems,
  take: DealItems,
): Proposal {
  const p: Proposal = {
    id: state.nextProposalId++,
    from,
    to,
    give,
    take,
    expiresTurn: state.turn + ctx.rules.settings.diplomacy.proposalTtl,
  };
  state.proposals.push(p);
  return p;
}

/** Turn-start processing for player p: pay/expire gold-per-turn, expire borders & stale proposals, decay grudges. */
export function processObligations(ctx: Ctx, state: GameState, p: PlayerId): void {
  const decay = ctx.rules.settings.diplomacy.grudgeDecay;
  for (const o of state.players) {
    if (o.id === p) continue;
    const out = state.relations[p][o.id];
    if (out.goldPerTurn > 0) {
      if (state.turn > out.goldUntil) {
        out.goldPerTurn = 0;
        out.goldUntil = 0;
      } else if (state.players[p].gold >= out.goldPerTurn) {
        state.players[p].gold -= out.goldPerTurn;
        state.players[o.id].gold += out.goldPerTurn;
      } else {
        out.goldPerTurn = 0;
        out.goldUntil = 0;
        state.relations[o.id][p].grudge += 5;
        pushEvent(state, { player: o.id, type: 'dealBroken', msg: `${state.players[p].name} failed to pay tribute owed to you` });
        pushEvent(state, { player: p, type: 'dealBroken', msg: `You could not pay tribute owed to ${state.players[o.id].name}` });
      }
    }
    if (out.openBordersUntil > 0 && state.turn > out.openBordersUntil) out.openBordersUntil = 0;
    if (out.grudge > 0) out.grudge = Math.max(0, out.grudge - decay);
  }
  state.proposals = state.proposals.filter((pr) => !(pr.to === p && state.turn > pr.expiresTurn));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (module compiles; not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git add src/engine/systems/diplomacy.ts
git commit -m "Add engine diplomacy mutations (deals, war, denounce, obligations)"
```

### Task C2: Validation for the new actions

**Files:**
- Modify: `src/engine/validate.ts`

- [ ] **Step 1: Add imports** — extend the existing import from `./selectors` to include `hasMet`, and add a `DealItems` type import from `./types`:

```ts
import type { Action, Axial, Ctx, GameState, Unit, DealItems } from './types';
```
(add `DealItems` to the existing type import; add `hasMet` to the `./selectors` import list.)

- [ ] **Step 2: Add the deal-items helper** near the bottom of the file (beside `ownUnit`):

```ts
function isEmptyDeal(d: DealItems): boolean {
  return d.gold === 0 && !d.goldPerTurn && !d.openBorders && !d.peace && !d.friendship;
}

function validateDealItems(
  ctx: Ctx,
  state: GameState,
  from: number,
  to: number,
  give: DealItems,
  take: DealItems,
): Validation {
  if (atWar(state, from, to)) {
    if (!give.peace || !take.peace) return fail('you are at war — only peace can be negotiated');
    if (give.friendship || take.friendship) return fail('cannot declare friendship during war');
  } else if (give.peace || take.peace) {
    return fail('you are not at war');
  }
  if (give.friendship || take.friendship) {
    if (!give.friendship || !take.friendship) return fail('friendship must be mutual');
    if (state.relations[from][to].friends) return fail('already friends');
  }
  if (give.gold < 0 || take.gold < 0) return fail('gold cannot be negative');
  if (give.gold > state.players[from].gold) return fail('you cannot afford that gold');
  if (take.gold > state.players[to].gold) return fail('they cannot afford that gold');
  for (const gpt of [give.goldPerTurn, take.goldPerTurn]) {
    if (gpt && (gpt.amount <= 0 || gpt.turns <= 0)) return fail('invalid per-turn payment');
  }
  if (isEmptyDeal(give) && isEmptyDeal(take)) return fail('the deal is empty');
  return { ok: true };
}
```

- [ ] **Step 3: Add the three action cases** inside the `switch (action.type)` (before the final closing brace of the switch):

```ts
    case 'PROPOSE_DEAL': {
      const to = state.players[action.to];
      if (!to || action.to === action.player) return fail('invalid recipient');
      if (!to.alive) return fail('that empire has fallen');
      if (!hasMet(state, action.player, action.to)) return fail('you have not met this power');
      return validateDealItems(ctx, state, action.player, action.to, action.give, action.take);
    }

    case 'RESPOND_DEAL': {
      const p = state.proposals.find((x) => x.id === action.proposal);
      if (!p) return fail('no such proposal');
      if (p.to !== action.player) return fail('not addressed to you');
      if (action.accept) return validateDealItems(ctx, state, p.from, p.to, p.give, p.take);
      return ok;
    }

    case 'DENOUNCE': {
      const t = state.players[action.target];
      if (!t || action.target === action.player) return fail('invalid target');
      if (!t.alive) return fail('that empire has fallen');
      if (!hasMet(state, action.player, action.target)) return fail('you have not met this power');
      if (state.relations[action.player][action.target].denounced) return fail('already denounced');
      return ok;
    }
```

- [ ] **Step 4: Gate `DECLARE_WAR` on having met.** In the existing `DECLARE_WAR` case, after the `!target.alive` check, add:

```ts
      if (!hasMet(state, action.player, action.target)) return fail('you have not met this power');
```

- [ ] **Step 5: Type-check** (reducer doesn't handle the new actions yet, but `validateAction`'s switch must stay exhaustive — TS will flag the reducer in C3, not here)

Run: `npx tsc --noEmit`
Expected: FAIL — `reducer.ts` `handle` switch is now non-exhaustive for the 3 new action types. C3 fixes it. (If your reducer switch has no exhaustiveness guard, this may PASS; either way proceed to C3.)

### Task C3: Reducer handlers

**Files:**
- Modify: `src/engine/reducer.ts`

- [ ] **Step 1: Add imports** at the top:

```ts
import { applyDeal, applyDenounce, enterWar, pushProposal } from './systems/diplomacy';
import { resolveProposal } from './diplomacy-eval';
import type { Proposal } from './types';
```

- [ ] **Step 2: Replace the `DECLARE_WAR` body** (the four `.status`/`.since` assignment lines added in A4) with a single call, keeping the existing `pushEvent`:

```ts
    case 'DECLARE_WAR': {
      enterWar(ctx, state, action.player, action.target);
      pushEvent(state, {
        player: null,
        type: 'war',
        msg: `${state.players[action.player].name} declares war on ${state.players[action.target].name}!`,
      });
      break;
    }
```

- [ ] **Step 3: Add the three new cases** (before the `END_TURN` case):

```ts
    case 'PROPOSE_DEAL': {
      const toName = state.players[action.to].name;
      if (state.players[action.to].controller === 'ai') {
        const probe: Proposal = { id: -1, from: action.player, to: action.to, give: action.give, take: action.take, expiresTurn: 0 };
        const res = resolveProposal(ctx, state, probe, state.players[action.player].controller === 'human');
        if (res.kind === 'accept') {
          applyDeal(ctx, state, action.player, action.to, action.give, action.take);
          pushEvent(state, { player: action.player, type: 'dealAccepted', msg: `${toName} accepted your proposal` });
        } else if (res.kind === 'counter') {
          pushProposal(ctx, state, action.to, action.player, res.give, res.take);
          pushEvent(state, { player: action.player, type: 'dealCounter', msg: `${toName} counters your proposal` });
        } else {
          pushEvent(state, { player: action.player, type: 'dealRejected', msg: `${toName} rejected your proposal` });
        }
      } else {
        pushProposal(ctx, state, action.player, action.to, action.give, action.take);
        pushEvent(state, { player: action.to, type: 'dealOffer', msg: `${state.players[action.player].name} proposes a deal` });
      }
      break;
    }

    case 'RESPOND_DEAL': {
      const idx = state.proposals.findIndex((p) => p.id === action.proposal);
      if (idx < 0) break;
      const p = state.proposals[idx];
      state.proposals.splice(idx, 1);
      if (action.accept) {
        applyDeal(ctx, state, p.from, p.to, p.give, p.take);
        pushEvent(state, { player: p.from, type: 'dealAccepted', msg: `${state.players[p.to].name} accepted your proposal` });
      } else {
        pushEvent(state, { player: p.from, type: 'dealRejected', msg: `${state.players[p.to].name} rejected your proposal` });
      }
      break;
    }

    case 'DENOUNCE': {
      applyDenounce(ctx, state, action.player, action.target);
      break;
    }
```

- [ ] **Step 3b: Remove the now-unused inline goto-cancel if present.** (No-op if your `DECLARE_WAR` already lost its old body in A4 — just confirm the case matches Step 2 exactly.)

- [ ] **Step 4: Write tests** — append to `tests/diplomacy.test.ts`:

```ts
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';

function meet(s: ReturnType<typeof flatWorld>, a: number, b: number) {
  s.relations[a][b].met = true;
  s.relations[b][a].met = true;
}

describe('diplomacy actions', () => {
  it('gifting gold to an AI is accepted and transfers gold', () => {
    const s0 = flatWorld(16, 10, 2);
    s0.players[0].gold = 300;
    meet(s0, 0, 1);
    const s = applyAction(ctx, s0, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 100 }, take: { gold: 0 } });
    expect(s.players[0].gold).toBe(200);
    expect(s.players[1].gold).toBe(100);
  });

  it('a one-sided demand on a neutral AI is rejected, no transfer', () => {
    const s0 = flatWorld(16, 10, 2);
    s0.players[1].gold = 300;
    meet(s0, 0, 1);
    const s = applyAction(ctx, s0, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 0 }, take: { gold: 200 } });
    expect(s.players[1].gold).toBe(300);
    expect(s.events.some((e) => e.type === 'dealRejected')).toBe(true);
  });

  it('open-borders deal sets a directional term', () => {
    const s0 = flatWorld(16, 10, 2);
    s0.players[0].gold = 1000;
    meet(s0, 0, 1);
    // bribe player 1 to open its borders to player 0
    const s = applyAction(ctx, s0, {
      type: 'PROPOSE_DEAL', player: 0, to: 1,
      give: { gold: 300 }, take: { gold: 0, openBorders: true },
    });
    expect(s.relations[1][0].openBordersUntil).toBe(s.turn + ctx.rules.settings.diplomacy.termLength);
  });

  it('making peace ends a war both ways and cancels pacts', () => {
    const s0 = flatWorld(16, 10, 2);
    declareWarBetween(s0, 0, 1);
    meet(s0, 0, 1);
    s0.relations[0][1].openBordersUntil = 99; // a leftover pact
    const s = applyAction(ctx, s0, {
      type: 'PROPOSE_DEAL', player: 0, to: 1,
      give: { gold: 0, peace: true }, take: { gold: 0, peace: true },
    });
    expect(s.relations[0][1].status).toBe('peace');
    expect(s.relations[1][0].status).toBe('peace');
  });

  it('denounce sets the flag, cancels friendship, and is rejected if repeated', () => {
    const s0 = flatWorld(16, 10, 2);
    meet(s0, 0, 1);
    s0.relations[0][1].friends = true;
    s0.relations[1][0].friends = true;
    const s = applyAction(ctx, s0, { type: 'DENOUNCE', player: 0, target: 1 });
    expect(s.relations[0][1].denounced).toBe(true);
    expect(s.relations[0][1].friends).toBe(false);
    expect(validateAction(ctx, s, { type: 'DENOUNCE', player: 0, target: 1 }).ok).toBe(false);
  });

  it('declaring war cancels gold-per-turn and stamps a grudge', () => {
    const s0 = flatWorld(16, 10, 2);
    meet(s0, 0, 1);
    s0.relations[0][1].goldPerTurn = 5;
    s0.relations[0][1].goldUntil = 99;
    const s = applyAction(ctx, s0, { type: 'DECLARE_WAR', player: 0, target: 1 });
    expect(s.relations[0][1].status).toBe('war');
    expect(s.relations[0][1].goldPerTurn).toBe(0);
    expect(s.relations[1][0].grudge).toBe(ctx.rules.settings.diplomacy.grudgeOnWar);
  });

  it('rejects negotiating with an unmet power', () => {
    const s = flatWorld(16, 10, 2);
    expect(validateAction(ctx, s, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 0 }, take: { gold: 0 } }).ok).toBe(false);
  });
});
```

- [ ] **Step 5: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/validate.ts src/engine/reducer.ts tests/diplomacy.test.ts
git commit -m "Validate and reduce diplomacy actions (deals, respond, denounce, war)"
```

### Task C4: Tick obligations in the turn loop

**Files:**
- Modify: `src/engine/systems/turn.ts`
- Test: `tests/diplomacy.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/diplomacy.test.ts`. Uses the same `endTurn`/`fullRound` helpers pattern as `engine.test.ts`:

```ts
import type { GameState } from '../src/engine/types';
const endTurn2 = (s: GameState) => applyAction(ctx, s, { type: 'END_TURN', player: s.currentPlayer });
const fullRound2 = (s: GameState) => {
  const n = s.players.filter((p) => p.alive).length;
  for (let i = 0; i < n; i++) s = endTurn2(s);
  return s;
};

describe('obligations tick', () => {
  it('pays gold-per-turn each round and expires at term end', () => {
    let s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    s.players[0].gold = 100;
    s.relations[0][1].goldPerTurn = 10;
    s.relations[0][1].goldUntil = s.turn + 1; // pays this turn and next, then expires
    const before1 = s.players[1].gold;
    s = fullRound2(s); // player 0's turn-start pays
    expect(s.players[1].gold).toBe(before1 + 10);
    s = fullRound2(s);
    s = fullRound2(s);
    // after goldUntil passes, the flow is cleared
    expect(s.relations[0][1].goldPerTurn).toBe(0);
  });

  it('open borders expire after their term', () => {
    let s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    s.relations[0][1].openBordersUntil = s.turn; // expires next time player 0 processes
    s = fullRound2(s);
    expect(s.relations[0][1].openBordersUntil).toBe(0);
  });
});
```

- [ ] **Step 2: Run — fails** (gold not transferred; obligations not processed)

Run: `npx vitest run tests/diplomacy.test.ts -t "obligations tick"`
Expected: FAIL.

- [ ] **Step 3: Wire it in.** In `src/engine/systems/turn.ts`, add the import:

```ts
import { processObligations } from './diplomacy';
```

Then in `beginTurn`, immediately after the player research/gold block (step 3, right before the `// 4. fresh eyes` / `recomputeVisibility` line), add:

```ts
  // diplomacy obligations: pay tribute, expire pacts & stale proposals, decay grudges
  processObligations(ctx, state, pid);
```

- [ ] **Step 4: Run — passes, and the whole suite stays green**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (49 prior + new diplomacy tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/systems/turn.ts tests/diplomacy.test.ts
git commit -m "Process diplomacy obligations each turn (tribute, expiry, grudge decay)"
```

### Task C5: Open borders in movement & pathfinding

**Files:**
- Modify: `src/engine/selectors.ts`
- Modify: `src/engine/map/pathfind.ts`
- Modify: `src/engine/systems/movement.ts`
- Test: `tests/diplomacy.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { findPath } from '../src/engine/map/pathfind';

describe('open borders', () => {
  it('lets a unit path into a peaceful rival\'s land only when granted', () => {
    const s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    // give player 1 a city so they own territory at (8..),(5)
    spawn(s, 1, 'settler', 8, 5);
    const founded = applyAction(ctx, { ...s, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: Object.values(s.units)[0].id });
    const w = spawn(founded as any, 0, 'warrior', 6, 5); // adjacent-ish to player 1's land
    refreshVis(founded as any);
    // closed borders: cannot path onto player 1's owned ring tile
    const blocked = findPath(ctx, founded as any, founded.units[w.id], { q: 8, r: 5 });
    expect(blocked).toBeNull();
    // grant open borders 1→0, then it can
    (founded as any).relations[1][0].openBordersUntil = (founded as any).turn + 5;
    const open = findPath(ctx, founded as any, founded.units[w.id], { q: 8, r: 5 });
    expect(open).not.toBeNull();
  });
});
```

> Note: this test composes founding + spawning; if the exact tile ownership makes pathing trivially blocked for other reasons, adjust the coordinates so `(8,5)` is owned by player 1 and reachable on open grassland. The assertion that matters: **null when closed, non-null when open**.

- [ ] **Step 2: Run — fails** (open borders ignored)

Run: `npx vitest run tests/diplomacy.test.ts -t "open borders"`
Expected: FAIL.

- [ ] **Step 3: Add the selector** to `src/engine/selectors.ts`:

```ts
export function bordersOpenTo(state: GameState, granter: PlayerId, grantee: PlayerId): boolean {
  return state.relations[granter][grantee].openBordersUntil >= state.turn;
}
```

- [ ] **Step 4: Pathfinding** — in `src/engine/map/pathfind.ts`, import `bordersOpenTo` from `../selectors` (add to the existing import), and change the peacetime border block inside `moveRulesFor`'s `canEnter`. Find:

```ts
        const owner = tileOwner(state, idx);
        if (owner !== null && owner !== pid && !atWar(state, pid, owner)) return false;
```

Replace with:

```ts
        const owner = tileOwner(state, idx);
        if (owner !== null && owner !== pid && !atWar(state, pid, owner) && !bordersOpenTo(state, owner, pid))
          return false;
```

- [ ] **Step 5: Movement execution** — in `src/engine/systems/movement.ts`, import `bordersOpenTo` (add to the existing `../selectors` import) and find the peacetime check:

```ts
      const owner = tileOwner(state, idx);
      if (owner !== null && owner !== unit.owner && !atWar(state, unit.owner, owner)) {
        blocked = true; // closed borders in peacetime
        break;
      }
```

Replace the condition with:

```ts
      const owner = tileOwner(state, idx);
      if (
        owner !== null &&
        owner !== unit.owner &&
        !atWar(state, unit.owner, owner) &&
        !bordersOpenTo(state, owner, unit.owner)
      ) {
        blocked = true; // closed borders in peacetime
        break;
      }
```

- [ ] **Step 6: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/engine/selectors.ts src/engine/map/pathfind.ts src/engine/systems/movement.ts tests/diplomacy.test.ts
git commit -m "Honor open-borders pacts in movement and pathfinding"
```

### Task C6: Grudge on city capture

**Files:**
- Modify: `src/engine/systems/cities.ts` (the `captureCity` function)
- Test: `tests/diplomacy.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { captureCity } from '../src/engine/systems/cities';

describe('capture grudge', () => {
  it('the former owner resents the conqueror', () => {
    const s = flatWorld(16, 10, 2);
    // give player 1 a city, then capture it as player 0
    const settler = spawn(s, 1, 'settler', 8, 5);
    const s1 = applyAction(ctx, { ...s, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: settler.id });
    const draft = structuredClone(s1) as any;
    const city = Object.values(draft.cities)[0] as any;
    captureCity(ctx, draft, city, 0);
    expect(draft.relations[1][0].grudge).toBeGreaterThanOrEqual(ctx.rules.settings.diplomacy.grudgeOnCapture);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/diplomacy.test.ts -t "capture grudge"`
Expected: FAIL.

- [ ] **Step 3: Add the grudge bump** in `src/engine/systems/cities.ts`. In `captureCity`, after `const oldOwner = city.owner;` add:

```ts
  state.relations[oldOwner][byPlayer].grudge += ctx.rules.settings.diplomacy.grudgeOnCapture;
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/systems/cities.ts tests/diplomacy.test.ts
git commit -m "Stamp a grudge on the former owner when a city is captured"
```

### Task C7: Replay determinism with diplomacy

**Files:**
- Modify: `tests/replay.test.ts`

- [ ] **Step 1: Write the test** — append a `describe` to `tests/replay.test.ts`:

```ts
import { initialState } from '../src/engine/state';
import { applyAction } from '../src/engine/reducer';
import { gameHash } from '../src/engine/serialize';
import { ctx } from './helpers';
import type { Action } from '../src/engine/types';

describe('diplomacy replay determinism', () => {
  it('a scripted diplomacy game replays bit-identically', () => {
    const config = {
      seed: 909,
      mapW: 30,
      mapH: 20,
      players: [
        { civ: 'rome', controller: 'human' as const },
        { civ: 'egypt', controller: 'ai' as const },
      ],
    };
    // force "met" by running enough turns is heavy; instead exercise actions that don't need met
    // by building a script that first meets via DECLARE_WAR is invalid (needs met). So mark met
    // through a known-safe sequence: run a few end-turns (units explore), then deal.
    const build = (): { final: ReturnType<typeof initialState>; log: Action[] } => {
      let s = initialState(config, ctx);
      const log: Action[] = [];
      const act = (a: Action) => {
        s = applyAction(ctx, s, a);
        log.push(a);
      };
      for (let i = 0; i < 12; i++) act({ type: 'END_TURN', player: s.currentPlayer });
      return { final: s, log };
    };
    const a = build();
    let replay = initialState(config, ctx);
    for (const action of a.log) replay = applyAction(ctx, replay, action);
    expect(gameHash(replay)).toBe(gameHash(a.final));
  });
});
```

> The point is the *machinery* (relations matrix, proposals, obligations) replays identically through normal turns. Deeper scripted deals are covered behaviorally in `diplomacy.test.ts`; the self-play test in Phase D exercises real AI deals under replay.

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/replay.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/replay.test.ts
git commit -m "Cover diplomacy state under replay determinism"
```

---

## Phase D — AI diplomacy

Goal: the AI consults attitude in its war decision and initiates proposals (peace when losing, friendship when warm, open borders toward a target); 4-AI self-play exercises deals and still replays bit-identically.

### Task D1: AI proposal initiation

**Files:**
- Create: `src/ai/diplomacy.ts`
- Test: `tests/diplomacy.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { initiateDiplomacy } from '../src/ai/diplomacy';

describe('AI diplomacy initiation', () => {
  it('an AI losing a war proposes peace to its attacker', () => {
    const s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    declareWarBetween(s, 0, 1);
    // player 0 is strong, player 1 is weak → player 1 should sue for peace
    spawn(s, 0, 'swordsman', 3, 3);
    spawn(s, 0, 'swordsman', 3, 4);
    spawn(s, 1, 'warrior', 9, 6);
    const action = initiateDiplomacy(ctx, s, 1);
    expect(action?.type).toBe('PROPOSE_DEAL');
    if (action?.type === 'PROPOSE_DEAL') {
      expect(action.give.peace && action.take.peace).toBe(true);
      expect(action.to).toBe(0);
    }
  });

  it('returns null when there is nothing worth proposing', () => {
    const s = flatWorld(16, 10, 2); // unmet, at peace
    expect(initiateDiplomacy(ctx, s, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/diplomacy.test.ts -t "AI diplomacy"`
Expected: FAIL.

- [ ] **Step 3: Create `src/ai/diplomacy.ts`**:

```ts
/**
 * AI diplomacy POLICY — what an AI chooses to propose. Resolution of offers
 * (accept/reject/counter) lives in the engine (diplomacy-eval); this module only
 * decides initiations, built on the same pure attitude/valuation. Deterministic:
 * sorted iteration, integer math, first sensible action wins.
 */
import type { Action, Ctx, GameState, PlayerId } from '../engine/types';
import { attitude } from '../engine/diplomacy-eval';
import { atWar, hasMet, militaryPower } from '../engine/selectors';

const ORDER = ['hostile', 'wary', 'neutral', 'cordial', 'friendly'] as const;

/** At most one diplomacy action per call (non-spammy). Returns null if nothing fits. */
export function initiateDiplomacy(ctx: Ctx, state: GameState, pid: PlayerId): Action | null {
  const d = ctx.rules.settings.diplomacy;
  const others = state.players
    .filter((p) => p.alive && p.id !== pid && hasMet(state, pid, p.id))
    .map((p) => p.id)
    .sort((a, b) => a - b);

  // 1. sue for peace when losing a war
  for (const o of others) {
    if (!atWar(state, pid, o)) continue;
    const mine = militaryPower(ctx, state, pid);
    const theirs = militaryPower(ctx, state, o);
    if (theirs > mine * 1.4) {
      // offer peace; sweeten with a little gold if we have it and we're really behind
      const sweeten = theirs > mine * 2 ? Math.min(state.players[pid].gold, 50) : 0;
      // avoid re-proposing the same pending offer
      if (!state.proposals.some((pr) => pr.from === pid && pr.to === o)) {
        return {
          type: 'PROPOSE_DEAL', player: pid, to: o,
          give: { gold: sweeten, peace: true }, take: { gold: 0, peace: true },
        };
      }
    }
  }

  // 2. offer friendship to a warm, peaceful neighbour we're not already friends with
  for (const o of others) {
    if (atWar(state, pid, o) || state.relations[pid][o].friends) continue;
    const band = attitude(ctx, state, pid, o).band;
    if (ORDER.indexOf(band) >= ORDER.indexOf(d.minFriendBand)) {
      if (!state.proposals.some((pr) => pr.from === pid && pr.to === o)) {
        return {
          type: 'PROPOSE_DEAL', player: pid, to: o,
          give: { gold: 0, friendship: true }, take: { gold: 0, friendship: true },
        };
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tests/diplomacy.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/diplomacy.ts tests/diplomacy.test.ts
git commit -m "Add AI diplomacy initiation (sue for peace, offer friendship)"
```

### Task D2: Wire diplomacy into the AI turn

**Files:**
- Modify: `src/ai/decide.ts`

- [ ] **Step 1: Add the import** at the top of `src/ai/decide.ts`:

```ts
import { initiateDiplomacy } from './diplomacy';
```

- [ ] **Step 2: Call it early in `decide`** — diplomacy before military moves. In `decide`, right after the research step (`// 1. research`) and before the city-production loop (`// 2. idle cities choose production`), add:

```ts
  // 1b. diplomacy: at most one initiation per turn
  const diplo = initiateDiplomacy(ctx, state, pid);
  if (diplo) {
    const v = tryDecision({ action: diplo, reason: diploReason(diplo, state) });
    if (v) return v;
  }
```

- [ ] **Step 3: Add the reason helper** at the bottom of `src/ai/decide.ts`:

```ts
function diploReason(action: Action, state: GameState): string {
  if (action.type !== 'PROPOSE_DEAL') return 'diplomacy';
  const to = state.players[action.to].name;
  if (action.give.peace) return `suing ${to} for peace`;
  if (action.give.friendship) return `offering friendship to ${to}`;
  return `proposing a deal to ${to}`;
}
```

Ensure `Action` and `GameState` are imported in `decide.ts` (they are — `Action` via the engine types import; add `GameState` if not already present).

- [ ] **Step 4: Run the full suite** (self-play will now include diplomacy actions)

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — including the existing self-play test (AIs now also negotiate; turns still terminate, log still replays).

- [ ] **Step 5: Commit**

```bash
git add src/ai/decide.ts
git commit -m "Let the AI act on diplomacy during its turn"
```

### Task D3: Self-play asserts deals happen and still replays

**Files:**
- Modify: `tests/selfplay.test.ts`

- [ ] **Step 1: Add a diplomacy assertion** — append a `describe` to `tests/selfplay.test.ts` (reuse its existing `runGame`/`config` if exported; otherwise replicate the minimal runner shown here):

```ts
describe('AI diplomacy in self-play', () => {
  it('rivals meet and at least one diplomacy action occurs over a long game', () => {
    const { state, log } = runGame(424242, 120);
    const diploActions = log.filter(
      (a) => a.type === 'PROPOSE_DEAL' || a.type === 'DENOUNCE' || a.type === 'RESPOND_DEAL',
    ).length;
    // met someone
    const metSomeone = state.players.some((p, i) =>
      state.players.some((_, j) => i !== j && state.relations[i][j].met),
    );
    expect(metSomeone).toBe(true);
    expect(diploActions).toBeGreaterThan(0);
  }, 120_000);
});
```

> If `runGame`/`config` are local (not exported) in `selfplay.test.ts`, this `describe` lives in the same file and uses them directly. The existing "deterministic and full log replays" test already guarantees the diplomacy-laden log replays bit-identically — no new replay test needed here.

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/selfplay.test.ts`
Expected: PASS (and the table/telemetry test still prints).

- [ ] **Step 3: Commit**

```bash
git add tests/selfplay.test.ts
git commit -m "Assert AI diplomacy occurs in self-play and replays identically"
```

---

## Phase E — Foreign Affairs UI

Goal: a full-screen council to view attitudes (with "why"), build deals with an honest verdict line, and propose them; a modal for incoming AI proposals; a top-bar entry with a pending badge. Engine/AI unchanged.

### Task E1: UI helpers (colors, blank deal, honest verdict)

**Files:**
- Create: `src/ui/diplomacy.ts`

- [ ] **Step 1: Create `src/ui/diplomacy.ts`**:

```ts
/**
 * UI-side diplomacy helpers. The verdict line calls the SAME engine valuation
 * the AI uses, so what the council predicts is exactly what the AI will do.
 */
import type { AttitudeBand } from '../data/types';
import type { DealItems, GameState, PlayerId } from '../engine/types';
import { gameCtx } from '../app/driver';
import { attitude, valueDeal } from '../engine/diplomacy-eval';

export interface DraftDeal {
  give: DealItems; // what the viewing player provides (viewer → rival)
  take: DealItems; // what the viewing player asks (rival → viewer)
}
export const emptyDraft = (): DraftDeal => ({ give: { gold: 0 }, take: { gold: 0 } });

export const ATTITUDE_COLOR: Record<AttitudeBand, string> = {
  hostile: '#C25B4A',
  wary: '#D08B4C',
  neutral: '#B9B09A',
  cordial: '#9CC069',
  friendly: '#7FB6D9',
};
export const ATTITUDE_LABEL: Record<AttitudeBand, string> = {
  hostile: 'Hostile',
  wary: 'Wary',
  neutral: 'Neutral',
  cordial: 'Cordial',
  friendly: 'Friendly',
};

export type VerdictTone = 'accept' | 'counter' | 'reject';

export function dealVerdict(
  game: GameState,
  viewer: PlayerId,
  rival: PlayerId,
  draft: DraftDeal,
): { tone: VerdictTone; text: string } {
  const d = gameCtx.rules.settings.diplomacy;
  const proposal = { id: -1, from: viewer, to: rival, give: draft.give, take: draft.take, expiresTurn: 0 };
  const band = attitude(gameCtx, game, rival, viewer).band;
  const margin = d.acceptMargin[band];
  const net = valueDeal(gameCtx, game, rival, proposal);
  if (net >= margin) return { tone: 'accept', text: 'They would accept this.' };
  if (net >= margin - d.counterWindow) return { tone: 'counter', text: 'They want more — they may counter.' };
  return { tone: 'reject', text: 'They would refuse this.' };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/diplomacy.ts
git commit -m "Add UI diplomacy helpers and shared deal-verdict"
```

### Task E2: Store & driver plumbing

**Files:**
- Modify: `src/app/store.ts`
- Modify: `src/app/driver.ts`

- [ ] **Step 1: Extend `AppState`** in `src/app/store.ts`. Add the import:

```ts
import type { DraftDeal } from '../ui/diplomacy';
```

Change the `overlay` field type to include diplomacy:

```ts
  overlay: 'tech' | 'menu' | 'diplomacy' | null;
```

Add these fields to the `AppState` interface (near `warConfirm`):

```ts
  diploTarget: PlayerId | null;
  draftDeal: DraftDeal | null;
  proposalModal: number | null; // proposal id to show in the incoming-offer modal
```

Add their initial values to the `initial` object:

```ts
  diploTarget: null,
  draftDeal: null,
  proposalModal: null,
```

- [ ] **Step 2: Surface incoming proposals** in `src/app/driver.ts`. Add a field to `LocalGame`:

```ts
  private lastProposalSeen = 0;
```

In `publish()`, after `this.drainEvents();`, add:

```ts
    this.surfaceProposals();
```

Add the method:

```ts
  private surfaceProposals(): void {
    const viewer = this.viewingPlayer;
    let newest = 0;
    for (const p of this.state.proposals) {
      if (p.to === viewer && p.id > this.lastProposalSeen && p.id > newest) newest = p.id;
    }
    if (newest > 0) {
      this.lastProposalSeen = newest;
      appStore.set({ proposalModal: newest });
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/store.ts src/app/driver.ts
git commit -m "Plumb diplomacy overlay state and incoming-proposal surfacing"
```

### Task E3: Foreign Affairs council + styles + mount

**Files:**
- Create: `src/ui/panels/ForeignAffairs.tsx`
- Modify: `src/ui/GameScreen.tsx`
- Modify: `src/ui/app.css`

- [ ] **Step 1: Create `src/ui/panels/ForeignAffairs.tsx`**:

```tsx
import { useState } from 'react';
import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { attitude } from '../../engine/diplomacy-eval';
import { atWar, metPlayers } from '../../engine/selectors';
import type { DealItems, PlayerId } from '../../engine/types';
import { ATTITUDE_COLOR, ATTITUDE_LABEL, dealVerdict, emptyDraft, type DraftDeal } from '../diplomacy';

export function ForeignAffairs() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const target = useApp((s) => s.diploTarget);
  const draft = useApp((s) => s.draftDeal) ?? emptyDraft();
  const [showWhy, setShowWhy] = useState(false);
  if (!game) return null;

  const met = metPlayers(game, viewer);
  const close = () => appStore.set({ overlay: null });
  const pick = (id: PlayerId) => appStore.set({ diploTarget: id, draftDeal: emptyDraft() });
  const setDraft = (next: DraftDeal) => appStore.set({ draftDeal: next });
  const term = gameCtx.rules.settings.diplomacy.termLength;

  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="diplo" onClick={(e) => e.stopPropagation()}>
        <div className="tech-head">
          <h2>FOREIGN AFFAIRS</h2>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Close (Esc)</button>
        </div>

        <div className="diplo-body scroll-quiet">
          <div className="powers">
            {met.length === 0 && <div className="muted">You have met no other powers yet.</div>}
            {met.map((id) => {
              const p = game.players[id];
              const att = attitude(gameCtx, game, id, viewer);
              const war = atWar(game, viewer, id);
              const friends = game.relations[viewer][id].friends;
              return (
                <div
                  key={id}
                  className={`power ${target === id ? 'is-active' : ''}`}
                  onClick={() => pick(id)}
                >
                  <span className="civ-dot" style={{ background: p.color }} />
                  <div className="grow">
                    <div className="nm">{p.name} · {gameCtx.rules.civs[p.civ].name}</div>
                    <div className="att" style={{ color: ATTITUDE_COLOR[att.band] }}>
                      {ATTITUDE_LABEL[att.band]}
                      {war && <span className="badge war"> ⚔ War</span>}
                      {friends && <span className="badge friend"> ♥ Friends</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {target !== null && (
            <DealTable
              game={game}
              viewer={viewer}
              rival={target}
              draft={draft}
              setDraft={setDraft}
              term={term}
              showWhy={showWhy}
              toggleWhy={() => setShowWhy((v) => !v)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DealTable(props: {
  game: ReturnType<typeof useApp<NonNullable<ReturnType<typeof gameState>>>>;
  viewer: PlayerId;
  rival: PlayerId;
  draft: DraftDeal;
  setDraft: (d: DraftDeal) => void;
  term: number;
  showWhy: boolean;
  toggleWhy: () => void;
}) {
  const { game, viewer, rival, draft, setDraft, term, showWhy, toggleWhy } = props;
  const war = atWar(game, viewer, rival);
  const att = attitude(gameCtx, game, rival, viewer);
  const verdict = dealVerdict(game, viewer, rival, draft);
  const myTurn = isMyTurn();

  const setGive = (patch: Partial<DealItems>) => setDraft({ ...draft, give: { ...draft.give, ...patch } });
  const setTake = (patch: Partial<DealItems>) => setDraft({ ...draft, take: { ...draft.take, ...patch } });
  const setBoth = (patch: Partial<DealItems>) =>
    setDraft({ give: { ...draft.give, ...patch }, take: { ...draft.take, ...patch } });

  const propose = () => {
    if (humanDispatch({ type: 'PROPOSE_DEAL', player: viewer, to: rival, give: draft.give, take: draft.take })) {
      setDraft(emptyDraft());
    }
  };

  const myGold = game.players[viewer].gold;
  const theirGold = game.players[rival].gold;

  return (
    <div className="deal">
      <div className="deal-why" onClick={toggleWhy}>
        Attitude: <b style={{ color: ATTITUDE_COLOR[att.band] }}>{ATTITUDE_LABEL[att.band]}</b> · ▸ why
      </div>
      {showWhy && (
        <ul className="why-list">
          {att.factors.length === 0 && <li className="muted">No strong feelings either way.</li>}
          {att.factors.map((f, i) => (
            <li key={i}>
              <span>{f.label}</span>
              <span className={f.delta >= 0 ? 'pos' : 'neg'}>{f.delta >= 0 ? `+${f.delta}` : f.delta}</span>
            </li>
          ))}
        </ul>
      )}

      {war ? (
        <label className="deal-row">
          <input
            type="checkbox"
            checked={!!draft.give.peace}
            onChange={(e) => setBoth({ peace: e.target.checked })}
          />
          Make peace
        </label>
      ) : (
        <div className="deal-cols">
          <div className="deal-col">
            <div className="deal-col-h">They give</div>
            <NumRow label="Gold" max={theirGold} value={draft.take.gold} onChange={(v) => setTake({ gold: v })} />
            <NumRow label={`Gold/turn (${term}t)`} max={Math.floor(theirGold / 4)} value={draft.take.goldPerTurn?.amount ?? 0}
              onChange={(v) => setTake({ goldPerTurn: v > 0 ? { amount: v, turns: term } : undefined })} />
            <label className="chk"><input type="checkbox" checked={!!draft.take.openBorders}
              onChange={(e) => setTake({ openBorders: e.target.checked })} /> Open borders</label>
          </div>
          <div className="deal-col">
            <div className="deal-col-h">You give</div>
            <NumRow label="Gold" max={myGold} value={draft.give.gold} onChange={(v) => setGive({ gold: v })} />
            <NumRow label={`Gold/turn (${term}t)`} max={Math.floor(myGold / 4)} value={draft.give.goldPerTurn?.amount ?? 0}
              onChange={(v) => setGive({ goldPerTurn: v > 0 ? { amount: v, turns: term } : undefined })} />
            <label className="chk"><input type="checkbox" checked={!!draft.give.openBorders}
              onChange={(e) => setGive({ openBorders: e.target.checked })} /> Open borders</label>
          </div>
        </div>
      )}

      {!war && (
        <label className="deal-row">
          <input type="checkbox" checked={!!draft.give.friendship}
            onChange={(e) => setBoth({ friendship: e.target.checked })}
            disabled={game.relations[viewer][rival].friends} />
          Declare friendship
        </label>
      )}

      <div className={`verdict ${verdict.tone}`}>{verdict.text}</div>
      <div className="deal-actions">
        <button className="btn btn--primary" disabled={!myTurn} onClick={propose}>Propose</button>
        <button className="btn" onClick={() => setDraft(emptyDraft())}>Clear</button>
      </div>
    </div>
  );
}

function NumRow(props: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const { label, value, max, onChange } = props;
  return (
    <label className="num-row">
      <span>{label}</span>
      <input
        type="number" min={0} max={Math.max(0, max)} value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(Math.max(0, max), Math.floor(Number(e.target.value) || 0))))}
      />
    </label>
  );
}

// local type alias to keep the prop typing readable
function gameState() {
  return appStore.get().game;
}
```

> If the `gameState`/prop-typing alias trips the linter, simplify `DealTable`'s `game` prop type to `import('../../engine/types').GameState`. The behavior is unchanged.

- [ ] **Step 2: Mount it + keybinding** in `src/ui/GameScreen.tsx`. Add the import:

```tsx
import { ForeignAffairs } from './panels/ForeignAffairs';
```

In the JSX, beside `{overlay === 'tech' && <TechTree />}`, add:

```tsx
      {overlay === 'diplomacy' && <ForeignAffairs />}
```

In the `onKey` switch, add a case (mirroring the `KeyT` case):

```tsx
        case 'KeyG':
          appStore.set({ overlay: ov === 'diplomacy' ? null : 'diplomacy' });
          break;
```

- [ ] **Step 3: Add styles** — append to `src/ui/app.css`:

```css
/* foreign affairs council */
.diplo { position: absolute; inset: 0; display: flex; flex-direction: column; }
.diplo-body { flex: 1; overflow: auto; padding: 8px 26px 26px; display: grid; grid-template-columns: 320px 1fr; gap: 22px; }
.powers { display: flex; flex-direction: column; gap: 6px; }
.power { display: flex; gap: 10px; align-items: center; padding: 10px 12px; cursor: pointer;
  background: rgba(10,14,20,0.4); border: 1px solid rgba(200,165,91,0.25);
  clip-path: polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0 calc(100% - 6px),0 6px); }
.power:hover { border-color: var(--brass); }
.power.is-active { border-color: var(--brass-bright); background: linear-gradient(90deg, rgba(200,165,91,0.18), rgba(200,165,91,0.05)); }
.power .nm { font-weight: 700; }
.power .att { font-size: 12px; margin-top: 1px; }
.power .badge { font-size: 11px; }
.power .badge.war { color: var(--danger); }
.power .badge.friend { color: #7FB6D9; }
.muted { color: var(--ivory-dim); font-size: 13px; }
.deal { max-width: 560px; }
.deal-why { cursor: pointer; color: var(--ivory-dim); font-size: 13px; margin-bottom: 8px; }
.why-list { list-style: none; margin: 0 0 12px; padding: 8px 12px; background: rgba(10,14,20,0.4);
  border: 1px solid rgba(200,165,91,0.2); font-size: 12.5px; }
.why-list li { display: flex; justify-content: space-between; padding: 2px 0; }
.why-list .pos { color: #9CC069; } .why-list .neg { color: #C25B4A; }
.deal-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.deal-col { background: rgba(10,14,20,0.35); border: 1px solid rgba(200,165,91,0.2); padding: 10px 12px; }
.deal-col-h { font-family: var(--font-display); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--brass); margin-bottom: 8px; }
.num-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 5px 0; font-size: 13px; }
.num-row input { width: 84px; background: rgba(10,14,20,0.5); border: 1px solid rgba(200,165,91,0.3); color: var(--ivory); padding: 4px 6px; font-family: var(--font-body); }
.chk, .deal-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 8px 0 0; }
.deal-row { margin: 12px 0; }
.verdict { margin: 14px 0; font-weight: 700; }
.verdict.accept { color: #9CC069; } .verdict.counter { color: #D08B4C; } .verdict.reject { color: #C25B4A; }
.deal-actions { display: flex; gap: 10px; }
```

- [ ] **Step 4: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/ForeignAffairs.tsx src/ui/GameScreen.tsx src/ui/app.css
git commit -m "Add Foreign Affairs council overlay with deal table and verdict"
```

### Task E4: Top-bar entry + incoming-proposal modal

**Files:**
- Modify: `src/ui/panels/TopBar.tsx`
- Modify: `src/ui/panels/Modals.tsx`
- Modify: `src/ui/GameScreen.tsx`

- [ ] **Step 1: Add the "Powers" entry** in `src/ui/panels/TopBar.tsx`. Beside the existing Counsel/Menu buttons, add (compute a pending count first, near the top of the component):

```tsx
  const pending = game.proposals.filter((p) => p.to === viewer).length;
```

Then in the JSX, before the `Counsel` button:

```tsx
      <button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'diplomacy' })} title="Foreign affairs (G)">
        Powers{pending > 0 ? ` ●` : ''}
      </button>
```

(Ensure `viewer` is in scope — it is, as `viewingPlayer`. If the component names it `viewer`, use that.)

- [ ] **Step 2: Add the proposal modal** to `src/ui/panels/Modals.tsx`. Add imports if missing (`humanDispatch` from `../actions`, `gameCtx` from `../../app/driver`), then add this component and render it from `GameScreen`:

```tsx
export function ProposalModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const id = useApp((s) => s.proposalModal);
  if (!game || id === null) return null;
  const p = game.proposals.find((x) => x.id === id && x.to === viewer);
  if (!p) return null;
  const from = game.players[p.from];
  const summary = (d: typeof p.give) => {
    const parts: string[] = [];
    if (d.peace) parts.push('peace');
    if (d.friendship) parts.push('friendship');
    if (d.gold) parts.push(`${d.gold} gold`);
    if (d.goldPerTurn) parts.push(`${d.goldPerTurn.amount} gold/turn (${d.goldPerTurn.turns}t)`);
    if (d.openBorders) parts.push('open borders');
    return parts.length ? parts.join(', ') : 'nothing';
  };
  const clear = () => appStore.set({ proposalModal: null });
  const respond = (accept: boolean) => {
    humanDispatch({ type: 'RESPOND_DEAL', player: viewer, proposal: p.id, accept });
    clear();
  };
  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>{from.name.toUpperCase()} PROPOSES</h2>
        <p>
          They give: <b>{summary(p.give)}</b>
          <br />
          They ask: <b>{summary(p.take)}</b>
        </p>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={() => respond(true)}>Accept</button>
          <button className="btn btn--danger" onClick={() => respond(false)}>Reject</button>
          <button className="btn" onClick={clear}>Later</button>
        </div>
      </div>
    </div>
  );
}
```

Make sure `useApp` and `appStore` are imported at the top of `Modals.tsx` (they are used by the other modals already).

- [ ] **Step 3: Render the modal** in `src/ui/GameScreen.tsx` — add `ProposalModal` to the imports from `./panels/Modals` and render it beside `<WarConfirm />`:

```tsx
      <ProposalModal />
```

- [ ] **Step 4: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/TopBar.tsx src/ui/panels/Modals.tsx src/ui/GameScreen.tsx
git commit -m "Add Powers top-bar entry and incoming-proposal modal"
```

### Task E5: Visual verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS (all prior + diplomacy tests).

- [ ] **Step 2: Drive the council in headless Chrome.** With the dev server running (`npm run dev`), adapt `scripts/inspect.mjs`: start a game, run `w().debugAutoplay(20)` so a rival is met, then:

```js
await page.keyboard.press('KeyG');           // open Foreign Affairs
await sleep(400);
await page.screenshot({ path: 'shots/diplo-council.png' });
// click the first power, then screenshot the deal table
await page.evaluate(() => document.querySelector('.power')?.click());
await sleep(300);
await page.screenshot({ path: 'shots/diplo-deal.png' });
```

Read the screenshots; confirm: known-powers list shows attitudes/badges, the deal table renders with the verdict line, no console errors. Fix any layout issues before committing.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "Polish Foreign Affairs layout from visual review"
```

---

## Self-Review (completed during planning)

**Spec coverage** — every spec section maps to a task:
- §3 settings → A1/A2. §4 state model + schema drop → A3/A4. §5 actions + apply → C1/C2/C3.
  §6 attitude/valuation/resolution → B2/B3 (resolution relocated to engine; see Phase B note).
  §7 met gating/selectors → B1/C5. §8 obligations → C1/C4. §9 borders → C5. §10 UI → E1–E4.
  §11 determinism → C7 + D3. §12 testing → tests across B/C/D + E5. §13 file map → File Structure.
- **Gap check:** `relationBadges` from §13 is implemented inline in the council (war/friends badges) rather than as a named selector — intentional simplification, no separate task needed. `canEnterForeignTile` is realized as `bordersOpenTo` (C5) — same behavior, simpler name. Both noted so they're not mistaken for omissions.

**Placeholder scan** — no TBD/TODO; every code step shows complete code; every test step shows real assertions.

**Type consistency** — `DealItems`/`Proposal`/`RelationState`/`AttitudeBand` defined in A1/A3 and used unchanged throughout; `attitude`/`valueDeal`/`resolveProposal` signatures in B2/B3 match their call sites in C3/D1/E1; `DraftDeal`/`emptyDraft` defined in E1 and consumed in E2/E3; `bordersOpenTo` defined in C5 and used in C5's pathfind/movement edits.

**One deliberate spec deviation** (documented at Phase B): `resolveProposal` lives in the engine, not `src/ai/`, so human→AI offers resolve immediately without the engine importing the AI layer. The AI module keeps initiation policy only. This strengthens the spec's layering goal rather than weakening it.



