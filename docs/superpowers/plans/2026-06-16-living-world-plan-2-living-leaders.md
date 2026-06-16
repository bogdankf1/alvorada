# Living World — Plan 2: Living Leaders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each rival a distinct character — behavioral **traits** that bias the AI, **agendas** (a known historical one + a seeded hidden one) that color how leaders feel about you, and **surfaced reactivity** so attitude visibly responds to wonders, culture, religion, score, and aggression.

**Architecture:** Builds on Plan 1's data-driven civ identity. Traits and agendas are pure data (`traits.ts`, `agendas.ts`); agenda/reactivity effects are added as **live-computed factors** in the existing `attitude()` (exactly like the current `borderFriction`/`landCompetition` factors), so the tuned diplomacy model stays intact and the existing Foreign Affairs "why" panel shows the new reasons for free. Traits feed a `traitWeights()` aggregation consumed at a few AI decision points. New per-game state (runtime traits, the seeded hidden agenda, first-contact turn, last-seen attitude band) bumps the schema **6 → 7**.

**DELIBERATE DEVIATION FROM SPEC §4.3 (surfaced to the user):** the spec proposed generalizing the `grudge` field into an `opinions[]` list with named reasons. At planning time we found the agenda/wonder/score/religion reactivity fits the **existing live-factor pattern** with no refactor, and an `opinions[]` list only earns its keep when *events* write arbitrary persistent memories — which is Plan 3. So we **keep `grudge` as-is** and defer the opinions model to Plan 3 (where it's actually used). The player-facing outcome (living, reactive leaders) is unchanged; risk to the tuned, self-play-seeded diplomacy model is much lower.

**Tech Stack:** TypeScript, Vitest. Pure deterministic engine; data-driven ruleset. Verify with `npm test` and `npm run build`; tune with `npm run sim`.

**Spec:** `docs/superpowers/specs/2026-06-16-living-world-design.md` §1–§3, §6 (traits/agendas/reactivity portions).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/data/types.ts` | Ruleset types | +`AiWeights`, `TraitDef`, `AgendaRule`, `AgendaDef`; +`traits?`/`agenda?` on `CivDef`; +5 attitude weights + `hiddenAgendaRevealTurns` on `DiplomacySettings`; +`traits`/`agendas` on `Ruleset` |
| `src/data/standard/traits.ts` | **new** | 8 trait defs (AI weight nudges) |
| `src/data/standard/agendas.ts` | **new** | 8 agenda defs (historical + hidden pool) |
| `src/data/standard/civs.ts` | Civ content | +`traits` (2 each) + `agenda` on the 4 playable civs |
| `src/data/standard/index.ts` | Ruleset assembly | wire `traits`/`agendas`; +new attitude weights + `hiddenAgendaRevealTurns` in SETTINGS |
| `src/data/validate.ts` | Validation | civ traits/agenda exist; agenda rules valid |
| `src/engine/types.ts` | State types | +`traits?`/`hiddenAgenda?` on `Player`; +`firstContactTurn?`/`lastBand?` on `RelationState`; bump comment |
| `src/engine/serialize.ts` | Schema | `SCHEMA_VERSION` 6 → 7 |
| `src/engine/state.ts` | Init | runtime traits from `CivDef`; seeded hidden agenda via a **pure hash** (no `rngState` consumption) |
| `src/engine/map/visibility.ts` | First contact | stamp `firstContactTurn` when `met` first flips |
| `src/engine/diplomacy-eval.ts` | Attitude | agenda factors (historical + hidden) + universal reactivity factors (shared religion, score gap); `agendaKnown` reveal selector |
| `src/engine/systems/diplomacy.ts` | Reactivity | track `lastBand`, emit `attitudeShift` events in `processObligations` |
| `src/engine/selectors.ts` | Read-model | `traitWeights()`, `wonderCount()`, `commonReligion()` helpers; fix Plan-1 happiness-breakdown label |
| `src/ai/economy.ts` | AI | trait nudges in `desiredCities` use + `pickProduction` (military threshold, building priority order) |
| `src/ai/decide.ts` | AI | trait nudges in `considerWar` (ratio + turn gate) |
| `src/ai/civics.ts` | AI | trait-preference belief/policy picks (replaces `pid % count`) |
| `src/ai/diplomacy.ts` | AI | `dealWillingness` lowers the friendship band gate |
| `src/app/driver.ts` | Toasts | add `attitudeShift` to `TOAST_TYPES` |
| `src/ui/panels/ForeignAffairs.tsx` | UI | show each rival's 2 traits + agenda (hidden until revealed) |
| `tests/helpers.ts` | Fixtures | `flatWorld` players get `traits`/`hiddenAgenda`; `blankRelation` already covers new optional fields |
| `tests/leaders.test.ts` | **new** | traits shift AI; agenda/reactivity shift attitude; reveal timing; determinism |

**Trait catalog (8):** `warmonger, expansionist, pious, scholarly, cultured, mercantile, defensive, diplomatic`.
**Agenda catalog (8):** historical agendas for the 4 civs + a hidden pool. Rules: `likesWonderBuilders, dislikesWarmongers, likesStrongMilitary, likesCultured, likesSharedReligion, dislikesNeighbors`.
**Leader kits:** Rome = traits[warmonger,expansionist] agenda=`likesStrongMilitary`; Egypt = [cultured,defensive] agenda=`likesWonderBuilders`; Babylon = [scholarly,diplomatic] agenda=`dislikesWarmongers`; Hellas = [cultured,pious] agenda=`likesCultured`.

---

### Task 1: Trait & agenda data types

**Files:** Modify `src/data/types.ts`.

- [ ] **Step 1: Add the types.** After the `CivAbility` union (added in Plan 1), add:

```ts
/** Numeric nudges a trait contributes to AI judgment. Summed across a leader's traits. */
export interface AiWeights {
  warThreshold?: number;   // added to considerWar's required power ratio (negative = more warlike)
  warTurnGate?: number;    // added to the earliest turn war is considered (negative = earlier)
  expansion?: number;      // added to the desired-cities target
  military?: number;       // production bias toward soldiers
  faith?: number;          // belief/policy/building preference toward faith
  science?: number;        // ...toward science
  culture?: number;        // ...toward culture/wonders
  gold?: number;           // ...toward gold
  dealWillingness?: number;// band-rank slack for offering friendship (higher = friendlier)
}
export interface TraitDef { id: string; name: string; blurb: string; weights: AiWeights; }

export type AgendaRule =
  | 'likesWonderBuilders' | 'dislikesWarmongers' | 'likesStrongMilitary'
  | 'likesCultured' | 'likesSharedReligion' | 'dislikesNeighbors';
export interface AgendaDef { id: string; name: string; blurb: string; rule: AgendaRule; }
```

- [ ] **Step 2: Extend `CivDef`** (add two optional fields after `uniqueAbility?`):

```ts
  traits?: string[]; // behavioral trait ids (playable civs; barbarians omit)
  agenda?: string;   // historical agenda id (revealed on meeting)
```

- [ ] **Step 3: Extend `DiplomacySettings.attitude`** — add five weights after `weakerRival: number;`:

```ts
    agendaRespected: number;
    agendaDefied: number;
    sharedReligion: number;
    scoreLeader: number;
    admiredWonders: number;
```

and add a sibling field on `DiplomacySettings` (after `minFriendBand`):

```ts
  hiddenAgendaRevealTurns: number; // turns of contact before a rival's hidden agenda shows
```

- [ ] **Step 4: Extend `Ruleset`** (after `civs: Record<string, CivDef>;`):

```ts
  traits: Record<string, TraitDef>;
  agendas: Record<string, AgendaDef>;
```

- [ ] **Step 5: Type-check.** Run `npx tsc -b`. Expected: FAIL — `STANDARD_RULESET` and `SETTINGS` now miss required fields (`traits`, `agendas`, the 5 attitude weights, `hiddenAgendaRevealTurns`). That's expected; Task 2 supplies them. (This task is types-only; commit together with Task 2.)

---

### Task 2: Trait & agenda content + ruleset wiring + validation

**Files:** Create `src/data/standard/traits.ts`, `src/data/standard/agendas.ts`; modify `src/data/standard/civs.ts`, `src/data/standard/index.ts`, `src/data/validate.ts`. Test: `tests/leaders.test.ts` (new).

- [ ] **Step 1: Write the failing test.** Create `tests/leaders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';

describe('trait & agenda content', () => {
  it('defines 8 traits and agendas, and validates clean', () => {
    expect(Object.keys(STANDARD_RULESET.traits).length).toBe(8);
    expect(Object.keys(STANDARD_RULESET.agendas).length).toBeGreaterThanOrEqual(6);
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });
  it('gives each playable civ two traits and an agenda', () => {
    for (const id of ['rome', 'egypt', 'babylon', 'hellas']) {
      const c = STANDARD_RULESET.civs[id];
      expect(c.traits?.length, id).toBe(2);
      expect(c.agenda, id).toBeDefined();
      for (const t of c.traits!) expect(STANDARD_RULESET.traits[t], t).toBeDefined();
      expect(STANDARD_RULESET.agendas[c.agenda!], c.agenda).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`STANDARD_RULESET.traits` undefined). Run: `npx vitest run tests/leaders.test.ts -t "trait & agenda content"`.

- [ ] **Step 3: Create `src/data/standard/traits.ts`:**

```ts
import type { TraitDef } from '../types';

export const TRAITS: Record<string, TraitDef> = {
  warmonger:    { id: 'warmonger',    name: 'Warmonger',    blurb: 'Quick to war; builds armies.',        weights: { warThreshold: -0.2, warTurnGate: -10, military: 2 } },
  expansionist: { id: 'expansionist', name: 'Expansionist', blurb: 'Settles widely and early.',            weights: { expansion: 1 } },
  pious:        { id: 'pious',        name: 'Pious',        blurb: 'Prizes faith and religion.',           weights: { faith: 2 } },
  scholarly:    { id: 'scholarly',    name: 'Scholarly',    blurb: 'Pursues science.',                     weights: { science: 2 } },
  cultured:     { id: 'cultured',     name: 'Cultured',     blurb: 'Builds wonders and culture.',          weights: { culture: 2 } },
  mercantile:   { id: 'mercantile',   name: 'Mercantile',   blurb: 'Chases gold and trade.',               weights: { gold: 2 } },
  defensive:    { id: 'defensive',    name: 'Defensive',    blurb: 'Slow to war; holds its ground.',        weights: { warThreshold: 0.2, warTurnGate: 15 } },
  diplomatic:   { id: 'diplomatic',   name: 'Diplomatic',   blurb: 'Seeks friends.',                        weights: { dealWillingness: 1 } },
};
```

- [ ] **Step 4: Create `src/data/standard/agendas.ts`:**

```ts
import type { AgendaDef } from '../types';

export const AGENDAS: Record<string, AgendaDef> = {
  conqueror:   { id: 'conqueror',   name: 'Conqueror',     blurb: 'Respects military strength.',          rule: 'likesStrongMilitary' },
  monumental:  { id: 'monumental',  name: 'Monument Builder', blurb: 'Admires great wonders.',            rule: 'likesWonderBuilders' },
  pacifist:    { id: 'pacifist',    name: 'Pacifist',      blurb: 'Despises warmongers.',                 rule: 'dislikesWarmongers' },
  aesthete:    { id: 'aesthete',    name: 'Aesthete',      blurb: 'Admires cultured peoples.',            rule: 'likesCultured' },
  devout:      { id: 'devout',      name: 'Devout',        blurb: 'Favors those who share the faith.',    rule: 'likesSharedReligion' },
  territorial: { id: 'territorial', name: 'Territorial',   blurb: 'Resents close neighbors.',             rule: 'dislikesNeighbors' },
  // extra hidden-pool variants
  zealot:      { id: 'zealot',      name: 'Zealot',        blurb: 'Demands shared faith.',                rule: 'likesSharedReligion' },
  warlord:     { id: 'warlord',     name: 'Warlord',       blurb: 'Honors only strength.',                rule: 'likesStrongMilitary' },
};
```

- [ ] **Step 5: Assign to civs** in `src/data/standard/civs.ts` — add to each playable civ (after its `uniqueAbility` line):

```ts
// rome:
    traits: ['warmonger', 'expansionist'], agenda: 'conqueror',
// egypt:
    traits: ['cultured', 'defensive'], agenda: 'monumental',
// babylon:
    traits: ['scholarly', 'diplomatic'], agenda: 'pacifist',
// hellas:
    traits: ['cultured', 'pious'], agenda: 'aesthete',
```

- [ ] **Step 6: Wire the ruleset** in `src/data/standard/index.ts`: import `TRAITS` from `'./traits'` and `AGENDAS` from `'./agendas'`; add `traits: TRAITS,` and `agendas: AGENDAS,` to `STANDARD_RULESET` (after `civs: CIVS,`). In `SETTINGS.diplomacy.attitude`, add the five new weights (after `weakerRival: 5,`):

```ts
      agendaRespected: 12,
      agendaDefied: -15,
      sharedReligion: 8,
      scoreLeader: -8,
      admiredWonders: 6,
```

and add `hiddenAgendaRevealTurns: 15,` to `SETTINGS.diplomacy` (after `minFriendBand: 'cordial',`).

- [ ] **Step 7: Validate** in `src/data/validate.ts` — before `return errors;` add:

```ts
  for (const civ of Object.values(rules.civs)) {
    for (const t of civ.traits ?? [])
      if (!(t in rules.traits)) errors.push(`civ ${civ.id}: unknown trait ${t}`);
    if (civ.agenda !== undefined && !(civ.agenda in rules.agendas))
      errors.push(`civ ${civ.id}: unknown agenda ${civ.agenda}`);
  }
```

- [ ] **Step 8: Run — expect PASS.** `npx vitest run tests/leaders.test.ts -t "trait & agenda content"` and `npx tsc -b`.

- [ ] **Step 9: Commit.**

```bash
git add src/data/types.ts src/data/standard/traits.ts src/data/standard/agendas.ts src/data/standard/civs.ts src/data/standard/index.ts src/data/validate.ts tests/leaders.test.ts
git commit -m "feat(data): leader traits and agendas (catalogs, civ kits, validation)"
```

---

### Task 3: Schema 6→7 — runtime traits, seeded hidden agenda, first-contact turn

**Files:** Modify `src/engine/types.ts`, `src/engine/serialize.ts`, `src/engine/state.ts`, `src/engine/map/visibility.ts`, `tests/helpers.ts`. Test: `tests/leaders.test.ts`.

- [ ] **Step 1: Write the failing test.** Append to `tests/leaders.test.ts`:

```ts
import { initialState } from '../src/engine/state';
import { ctx } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';

describe('leader state init', () => {
  const cfg = { seed: 7, mapW: 24, mapH: 20,
    players: [{ civ: 'rome', controller: 'ai' as const }, { civ: 'egypt', controller: 'ai' as const }] };
  it('schema is 7', () => { expect(SCHEMA_VERSION).toBe(7); });
  it('seeds runtime traits from the civ and a deterministic hidden agenda', () => {
    const a = initialState(cfg, ctx);
    const b = initialState(cfg, ctx);
    expect(a.players[0].traits).toEqual(ctx.rules.civs.rome.traits);
    expect(a.players[0].hiddenAgenda).toBeDefined();
    expect(a.players[0].hiddenAgenda! in ctx.rules.agendas).toBe(true);
    expect(a.players[0].hiddenAgenda).toBe(b.players[0].hiddenAgenda); // deterministic from seed
  });
  it('does not perturb the rng stream (hidden agenda uses a pure hash)', () => {
    const a = initialState(cfg, ctx);
    expect(a.rngState).toBe((cfg.seed ^ 0x51ab1e) | 0); // unchanged by agenda assignment
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`SCHEMA_VERSION` is 6; `traits`/`hiddenAgenda` undefined). Run: `npx vitest run tests/leaders.test.ts -t "leader state init"`.

- [ ] **Step 3: State types** in `src/engine/types.ts`. On `Player`, after `barbarian?: boolean;` add:

```ts
  traits?: string[];      // runtime traits (init from CivDef; events may alter later)
  hiddenAgenda?: string;  // seeded once per game from (seed, id)
```

On `RelationState`, after `grudge: number;` add:

```ts
  firstContactTurn?: number; // turn `met` first became true (symmetric); undefined until met
  lastBand?: string;         // subject's last-seen attitude band toward target (reactivity)
```

(`blankRelation()` needs no change — both new fields are optional/undefined initially.)

- [ ] **Step 4: Bump schema.** In `src/engine/serialize.ts`: `export const SCHEMA_VERSION = 7;`

- [ ] **Step 5: Init** in `src/engine/state.ts`. Add a pure hash helper at the top (after imports):

```ts
/** Deterministic pick from (seed, id) WITHOUT touching rngState — keeps the rng stream stable. */
function pickHidden(seed: number, id: number, pool: string[]): string {
  let h = (seed ^ (id * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return pool[h % pool.length];
}
```

In the playable-player map, add `traits` + `hiddenAgenda` to the returned player object (after `nextCityName: 0,`):

```ts
      traits: [...(civ.traits ?? [])],
      hiddenAgenda: pickHidden(config.seed, id, Object.keys(rules.agendas).sort()),
```

(The barbarian player pushed below needs no traits/agenda — leave it as is; both fields are optional.)

- [ ] **Step 6: First contact** in `src/engine/map/visibility.ts` — replace the `mark` function body:

```ts
  const mark = (other: PlayerId) => {
    if (other === player) return;
    if (!state.relations[player][other].met) {
      state.relations[player][other].firstContactTurn = state.turn;
      state.relations[other][player].firstContactTurn = state.turn;
    }
    state.relations[player][other].met = true;
    state.relations[other][player].met = true;
  };
```

- [ ] **Step 7: Fixtures** in `tests/helpers.ts` — in `flatWorld`, add to each player object (after `nextCityName: 0,`):

```ts
    traits: [] as string[],
    hiddenAgenda: undefined as string | undefined,
```

(Leaving `traits: []` keeps fixture AI behavior trait-neutral unless a test sets them; `blankRelation` already supplies the relation fields.)

- [ ] **Step 8: Run — expect PASS.** `npx vitest run tests/leaders.test.ts -t "leader state init"`. Then `npm test` to confirm the schema bump didn't break serialization/replay (replay/selfplay rebuild state through the same code, so they stay green; if a saved-fixture test hardcodes schema 6, update it to 7).

- [ ] **Step 9: Commit.**

```bash
git add src/engine/types.ts src/engine/serialize.ts src/engine/state.ts src/engine/map/visibility.ts tests/helpers.ts tests/leaders.test.ts
git commit -m "feat(engine): schema 7 — runtime traits, seeded hidden agenda, first-contact turn"
```

---

### Task 4: Agenda + reactivity factors in `attitude()`

**Files:** Modify `src/engine/selectors.ts` (helpers), `src/engine/diplomacy-eval.ts` (factors + reveal). Test: `tests/leaders.test.ts`.

- [ ] **Step 1: Write the failing test.** Append to `tests/leaders.test.ts`:

```ts
import { attitude, agendaKnown } from '../src/engine/diplomacy-eval';
import { flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';

describe('agenda & reactivity attitude', () => {
  it('a wonder-loving agenda warms toward a rival with more wonders', () => {
    let s = flatWorld(16, 12, 2);
    s.players[0].civ = 'egypt';     // agenda: monumental (likesWonderBuilders)
    s.players[0].hiddenAgenda = 'territorial'; // ensure the hidden one doesn't also fire here
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 1, 'settler', 11, 6);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: b.id });
    s = thaw(s);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    const before = attitude(ctx, s, 0, 1).score;
    const rivalCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    rivalCity.buildings.push('pyramids', 'great_library');
    s.wondersBuilt['pyramids'] = rivalCity.id; s.wondersBuilt['great_library'] = rivalCity.id;
    const after = attitude(ctx, s, 0, 1).score;
    expect(after).toBeGreaterThan(before); // agenda respected raises attitude
    expect(attitude(ctx, s, 0, 1).factors.some((f) => /Monument Builder/.test(f.label))).toBe(true);
  });

  it('hidden agenda is concealed until the reveal turn', () => {
    let s = flatWorld(12, 10, 2);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    s.relations[0][1].firstContactTurn = 1; s.turn = 5;
    expect(agendaKnown(ctx, s, 0, 1).hidden).toBe(false); // 5 - 1 < 15
    s.turn = 20;
    expect(agendaKnown(ctx, s, 0, 1).hidden).toBe(true);  // 20 - 1 >= 15
    expect(agendaKnown(ctx, s, 0, 1).historical).toBe(true); // always once met
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`agendaKnown` not exported; no Monument Builder factor). Run: `npx vitest run tests/leaders.test.ts -t "agenda & reactivity"`.

- [ ] **Step 3: Read-model helpers** in `src/engine/selectors.ts` — add near `playerCities`:

```ts
/** Count of World Wonders a player currently owns. */
export function wonderCount(state: GameState, pid: PlayerId): number {
  let n = 0;
  for (const wid of Object.keys(state.wondersBuilt))
    if (state.cities[state.wondersBuilt[wid]]?.owner === pid) n++;
  return n;
}

/** True when a and b each have a city whose majority religion is the same. */
export function commonReligion(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const setA = new Set<string>();
  for (const c of playerCities(state, a)) if (c.religion) setA.add(c.religion);
  if (setA.size === 0) return false;
  for (const c of playerCities(state, b)) if (c.religion && setA.has(c.religion)) return true;
  return false;
}
```

- [ ] **Step 4: Agenda + reactivity in `attitude()`** (`src/engine/diplomacy-eval.ts`). Add imports: `computeScore, wonderCount, commonReligion` from `./selectors`. Add this helper above `attitude`:

```ts
/** One agenda's verdict on `toward`, from `subject`'s view. Relative comparisons — no magic numbers. */
function agendaFactor(
  ctx: Ctx, state: GameState, subject: PlayerId, toward: PlayerId, agendaId: string | undefined,
): AttitudeFactor | null {
  if (!agendaId) return null;
  const ag = ctx.rules.agendas[agendaId];
  if (!ag) return null;
  const w = ctx.rules.settings.diplomacy.attitude;
  const yes = (why: string, delta: number): AttitudeFactor => ({ label: `${ag.name}: ${why}`, delta });
  switch (ag.rule) {
    case 'likesWonderBuilders':
      return wonderCount(state, toward) > wonderCount(state, subject) ? yes('admires their wonders', w.agendaRespected) : null;
    case 'dislikesWarmongers':
      return state.players.some((p) => p.alive && p.id !== toward && state.relations[toward][p.id]?.status === 'war')
        ? yes('abhors their warmongering', w.agendaDefied) : null;
    case 'likesStrongMilitary':
      return militaryPower(ctx, state, toward) >= militaryPower(ctx, state, subject) ? yes('respects their strength', w.agendaRespected) : null;
    case 'likesCultured':
      return state.players[toward].cultureTotal > state.players[subject].cultureTotal ? yes('admires their culture', w.agendaRespected) : null;
    case 'likesSharedReligion':
      return commonReligion(state, subject, toward) ? yes('shares the true faith', w.agendaRespected) : null;
    case 'dislikesNeighbors':
      return territoriesTouch(state, subject, toward) ? yes('resents the shared border', w.agendaDefied) : null;
  }
}
```

Then in `attitude()`, just before `const score = factors.reduce(...)`, add:

```ts
  // agendas: the subject's historical + hidden agenda judge `toward`
  const civAgenda = ctx.rules.civs[state.players[subject].civ]?.agenda;
  const af1 = agendaFactor(ctx, state, subject, toward, civAgenda);
  if (af1) add(af1.label, af1.delta);
  const hidden = state.players[subject].hiddenAgenda;
  if (hidden && hidden !== civAgenda) {
    const af2 = agendaFactor(ctx, state, subject, toward, hidden);
    if (af2) add(af2.label, af2.delta);
  }
  // universal reactivity (every leader feels these a little)
  if (commonReligion(state, subject, toward)) add('Shared faith', d.sharedReligion);
  if (wonderCount(state, toward) > wonderCount(state, subject)) add('Awed by their wonders', d.admiredWonders);
  if (computeScore(ctx, state, toward) > computeScore(ctx, state, subject) * 1.3) add('Overshadowing us', d.scoreLeader);
```

- [ ] **Step 5: Reveal selector** — add to `src/engine/diplomacy-eval.ts`:

```ts
/** What `viewer` knows of `rival`'s agendas: historical once met, hidden after the reveal delay. */
export function agendaKnown(ctx: Ctx, state: GameState, viewer: PlayerId, rival: PlayerId): { historical: boolean; hidden: boolean } {
  const rel = state.relations[viewer][rival];
  const met = rel.met;
  const since = rel.firstContactTurn ?? state.turn;
  const hidden = met && state.turn - since >= ctx.rules.settings.diplomacy.hiddenAgendaRevealTurns;
  return { historical: met, hidden };
}
```

- [ ] **Step 6: Run — expect PASS.** `npx vitest run tests/leaders.test.ts -t "agenda & reactivity"`.

- [ ] **Step 7: Commit.**

```bash
git add src/engine/selectors.ts src/engine/diplomacy-eval.ts tests/leaders.test.ts
git commit -m "feat(engine): agendas and reactivity feed attitude (wonders, culture, religion, score)"
```

---

### Task 5: Traits bias the AI

**Files:** Modify `src/engine/selectors.ts` (`traitWeights`), `src/ai/decide.ts`, `src/ai/economy.ts`, `src/ai/civics.ts`, `src/ai/diplomacy.ts`. Test: `tests/leaders.test.ts`.

- [ ] **Step 1: Write the failing test.** Append to `tests/leaders.test.ts`:

```ts
import { considerWarForTest } from '../src/ai/decide';
import { traitWeights } from '../src/engine/selectors';

describe('traits bias the AI', () => {
  it('aggregates trait weights', () => {
    let s = flatWorld(12, 10, 2);
    s.players[0].traits = ['warmonger'];
    expect(traitWeights(ctx, s, 0).military).toBe(2);
    expect(traitWeights(ctx, s, 0).warThreshold).toBeCloseTo(-0.2);
    s.players[0].traits = ['defensive'];
    expect(traitWeights(ctx, s, 0).warTurnGate).toBe(15);
  });

  it('a warmonger declares war at a lower power ratio than a defensive leader', () => {
    // Build two identical states; only the attacker's traits differ.
    function setup(traits: string[]) {
      let s = flatWorld(20, 14, 2);
      s.turn = 60;
      s.players[0].traits = traits;
      const ours = spawn(s, 0, 'settler', 4, 7);
      const theirs = spawn(s, 1, 'settler', 12, 7);
      refreshVis(s);
      s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: ours.id });
      s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: theirs.id });
      s = thaw(s);
      s.relations[0][1].met = true; s.relations[1][0].met = true;
      // give player 0 a modest edge: 3 warriors vs 2
      for (let i = 0; i < 3; i++) spawn(s, 0, 'warrior', 4 + i, 8);
      for (let i = 0; i < 2; i++) spawn(s, 1, 'warrior', 12 + i, 8);
      refreshVis(s);
      return thaw(s);
    }
    const warmonger = considerWarForTest(ctx, setup(['warmonger']), 0);
    const defensive = considerWarForTest(ctx, setup(['defensive']), 0);
    expect(warmonger?.action.type).toBe('DECLARE_WAR'); // lowered ratio → attacks
    expect(defensive).toBeNull();                         // raised ratio → holds
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`traitWeights`/`considerWarForTest` not exported). Run: `npx vitest run tests/leaders.test.ts -t "traits bias"`.

- [ ] **Step 3: `traitWeights`** in `src/engine/selectors.ts` — add (import `AiWeights` from `../data/types`):

```ts
/** Sum of all of a player's runtime traits' weight nudges. */
export function traitWeights(ctx: Ctx, state: GameState, pid: PlayerId): Required<AiWeights> {
  const out: Required<AiWeights> = {
    warThreshold: 0, warTurnGate: 0, expansion: 0, military: 0,
    faith: 0, science: 0, culture: 0, gold: 0, dealWillingness: 0,
  };
  for (const t of state.players[pid].traits ?? []) {
    const w = ctx.rules.traits[t]?.weights;
    if (!w) continue;
    (Object.keys(out) as (keyof AiWeights)[]).forEach((k) => { out[k] += w[k] ?? 0; });
  }
  return out;
}
```

- [ ] **Step 4: War appetite** in `src/ai/decide.ts`. Import `traitWeights` from `../engine/selectors`. In `considerWar`, replace:

```ts
  if (state.turn < 30) return null;
```
with
```ts
  const tw = traitWeights(ctx, state, pid);
  if (state.turn < 30 + tw.warTurnGate) return null;
```
and replace:
```ts
  const ratioNeeded = cramped ? 1.3 : 1.45;
```
with
```ts
  const ratioNeeded = (cramped ? 1.3 : 1.45) + tw.warThreshold;
```
Then export a test seam at the bottom of the file:
```ts
/** Test seam: expose the otherwise-internal war counsel. */
export function considerWarForTest(ctx: Ctx, state: GameState, pid: PlayerId): AiDecision | null {
  return considerWar(ctx, state, pid);
}
```

- [ ] **Step 5: Expansion + production focus** in `src/ai/economy.ts`. Import `traitWeights`. In `pickProduction`, after `const threat = threatNear(...)`, add `const tw = traitWeights(ctx, state, pid);`. Then:
  - In the expansion check, replace `desiredCities(state)` (both occurrences in that `if` and its reason string) with `desiredCities(state) + tw.expansion`.
  - In step 5 (keep pace militarily), replace `if (myPower < rivalPower * 0.8)` with `if (myPower < rivalPower * (0.8 + tw.military * 0.1))`.
  - Replace the fixed `BUILDING_PRIORITY` use in step 7 with a trait-ordered copy. Add this helper above `pickProduction`:

```ts
const FOCUS_BUILDINGS: Record<string, string[]> = {
  faith: ['shrine', 'temple', 'monastery', 'cathedral'],
  science: ['library', 'university', 'observatory'],
  culture: ['monument', 'temple', 'cathedral'],
  gold: ['market', 'bank'],
};
/** BUILDING_PRIORITY with a leader's trait-favored buildings moved to the front (stable otherwise). */
function buildingPriorityFor(tw: Required<import('../engine/types').Ctx extends never ? never : import('../data/types').AiWeights>): string[] {
  const front: string[] = [];
  for (const k of ['faith', 'science', 'culture', 'gold'] as const)
    if (tw[k] > 0) for (const b of FOCUS_BUILDINGS[k]) if (!front.includes(b)) front.push(b);
  return [...front, ...BUILDING_PRIORITY.filter((b) => !front.includes(b))];
}
```

  (If the inline `import(...)` type is awkward, simply type the parameter `tw: Required<AiWeights>` and import `AiWeights` from `'../data/types'`.) Then in step 7 replace `for (const b of BUILDING_PRIORITY) {` with `for (const b of buildingPriorityFor(tw)) {`.

- [ ] **Step 6: Belief/policy preference** in `src/ai/civics.ts`. Import `traitWeights` from `'../engine/selectors'`. Replace `pickBelief` and `pickPolicy` with trait-aware versions:

```ts
function focusYield(ctx: Ctx, state: GameState, pid: PlayerId): 'faith' | 'science' | 'culture' | 'gold' | null {
  const tw = traitWeights(ctx, state, pid);
  let best: { k: 'faith' | 'science' | 'culture' | 'gold'; v: number } | null = null;
  for (const k of ['faith', 'science', 'culture', 'gold'] as const)
    if (tw[k] > 0 && (!best || tw[k] > best.v)) best = { k, v: tw[k] };
  return best?.k ?? null;
}

function pickBelief(ctx: Ctx, state: GameState, pid: PlayerId, kind: 'pantheon' | 'founder' | 'follower'): string | null {
  const ids = Object.keys(ctx.rules.beliefs).filter((id) => ctx.rules.beliefs[id].kind === kind).sort();
  if (!ids.length) return null;
  const focus = focusYield(ctx, state, pid);
  if (focus) {
    const scored = ids
      .map((id) => ({ id, v: ctx.rules.beliefs[id].effect.yields?.[focus] ?? 0 }))
      .sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
    if (scored[0].v > 0) return scored[0].id;
  }
  return ids[pid % ids.length]; // deterministic fallback
}

function pickPolicy(ctx: Ctx, state: GameState, pid: PlayerId): string | null {
  const p = state.players[pid];
  const affordable = Object.keys(ctx.rules.policies).sort().filter((id) => {
    const pol = ctx.rules.policies[id];
    return !p.policies.includes(id) && pol.prereqs.every((pre) => p.policies.includes(pre)) && p.policyProgress >= pol.cost;
  });
  if (!affordable.length) return null;
  const focus = focusYield(ctx, state, pid);
  if (focus) {
    const preferred = affordable.find((id) => (ctx.rules.policies[id].effect.yields?.[focus] ?? 0) > 0);
    if (preferred) return preferred;
  }
  return affordable[0];
}
```

Update the two `pickBelief(ctx, pid, ...)` call sites in `civicAction` to `pickBelief(ctx, state, pid, ...)`.

- [ ] **Step 7: Friendliness** in `src/ai/diplomacy.ts`. Import `traitWeights` from `'../engine/selectors'`. In `initiateDiplomacy`, replace:

```ts
    if (bandRank(band) >= bandRank(d.minFriendBand)) {
```
with
```ts
    if (bandRank(band) >= bandRank(d.minFriendBand) - traitWeights(ctx, state, pid).dealWillingness) {
```

- [ ] **Step 8: Run — expect PASS.** `npx vitest run tests/leaders.test.ts -t "traits bias"`. Then `npx tsc -b`.

- [ ] **Step 9: Commit.**

```bash
git add src/engine/selectors.ts src/ai/decide.ts src/ai/economy.ts src/ai/civics.ts src/ai/diplomacy.ts tests/leaders.test.ts
git commit -m "feat(ai): leader traits bias war appetite, expansion, production, civics, diplomacy"
```

---

### Task 6: Surfaced reactivity — attitude-shift notifications

**Files:** Modify `src/engine/systems/diplomacy.ts` (`processObligations`), `src/app/driver.ts` (`TOAST_TYPES`). Test: `tests/leaders.test.ts`.

- [ ] **Step 1: Write the failing test.** Append to `tests/leaders.test.ts`:

```ts
import { processObligations } from '../src/engine/systems/diplomacy';

describe('attitude-shift notifications', () => {
  it('emits an event (to the felt-about player) when a leader\'s band worsens to wary', () => {
    let s = flatWorld(16, 12, 2);
    s.players[0].civ = 'babylon'; // pacifist agenda (dislikesWarmongers)
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 1, 'settler', 11, 6);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: b.id });
    s = thaw(s);
    s.relations[0][1].met = true; s.relations[1][0].met = true;
    s.relations[0][1].lastBand = 'neutral';
    // make player 1 a warmonger in babylon's eyes: at war with the barbarians is already true,
    // so the pacifist agenda fires; also stamp a grudge to push the band down.
    s.relations[0][1].grudge = 40;
    const seqBefore = s.eventSeq;
    processObligations(ctx, s, 0);
    const shift = s.events.find((e) => e.seq >= seqBefore && e.type === 'attitudeShift');
    expect(shift).toBeDefined();
    expect(shift!.player).toBe(1); // the player being felt about hears "X has grown wary of you"
    expect(s.relations[0][1].lastBand).not.toBe('neutral'); // updated
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (no `attitudeShift` event). Run: `npx vitest run tests/leaders.test.ts -t "attitude-shift"`.

- [ ] **Step 3: Track band changes** in `src/engine/systems/diplomacy.ts`. Add imports: `import { attitude, bandRank } from '../diplomacy-eval';`. In `processObligations`, inside the `for (const o of state.players)` loop, after the existing grudge-decay line (`if (out.grudge > 0) ...`), add:

```ts
    // reactivity: surface when p's feelings toward a met rival cross a dramatic threshold
    if (out.met && !state.players[o.id].barbarian) {
      const band = attitude(ctx, state, p, o.id).band;
      const prev = out.lastBand;
      if (prev && prev !== band) {
        const worsened = bandRank(band) < bandRank(prev as never);
        const dramatic = band === 'wary' || band === 'hostile' || band === 'friendly';
        if (dramatic && (worsened || band === 'friendly')) {
          pushEvent(state, {
            player: o.id, // the rival being felt about hears about it
            type: 'attitudeShift',
            msg: `${state.players[p].name} has grown ${band} toward you`,
          });
        }
      }
      out.lastBand = band;
    }
```

(Determinism: `processObligations` runs in the reducer at turn start over sorted players; integer math; no RNG.)

- [ ] **Step 4: Toast it** in `src/app/driver.ts` — add `'attitudeShift',` to the `TOAST_TYPES` set.

- [ ] **Step 5: Run — expect PASS.** `npx vitest run tests/leaders.test.ts -t "attitude-shift"`.

- [ ] **Step 6: Commit.**

```bash
git add src/engine/systems/diplomacy.ts src/app/driver.ts tests/leaders.test.ts
git commit -m "feat(engine): surface attitude-shift notifications when a rival's band crosses"
```

---

### Task 7: Foreign Affairs shows traits & agenda; fix happiness-breakdown label

**Files:** Modify `src/ui/panels/ForeignAffairs.tsx`; `src/engine/selectors.ts` (`happinessBreakdown` label — the Plan-1 deferred nit).

- [ ] **Step 1: Foreign Affairs — traits + agenda.** In `src/ui/panels/ForeignAffairs.tsx`, import the reveal selector: add `agendaKnown` to the existing `import { attitude } from '../../engine/diplomacy-eval';` → `import { attitude, agendaKnown } from '../../engine/diplomacy-eval';`. Inside the `met.map((id) => { ... })` block, after computing `const att = attitude(gameCtx, game, id, viewer);`, add:

```ts
              const civ = gameCtx.rules.civs[p.civ];
              const know = agendaKnown(gameCtx, game, viewer, id);
              const knownAgenda = know.hidden && p.hiddenAgenda && p.hiddenAgenda !== civ.agenda
                ? gameCtx.rules.agendas[p.hiddenAgenda] : null;
              const histAgenda = civ.agenda ? gameCtx.rules.agendas[civ.agenda] : null;
```

Then, inside the `<div className="grow">`, after the `<div className="att">…</div>` block, add a personality line:

```tsx
                    <div className="leader-traits muted" style={{ fontSize: 11 }}>
                      {(civ.traits ?? []).map((t) => gameCtx.rules.traits[t]?.name).filter(Boolean).join(' · ')}
                      {histAgenda && <> · <span title={histAgenda.blurb}>{histAgenda.name}</span></>}
                      {knownAgenda && <> · <span title={knownAgenda.blurb}>{knownAgenda.name}</span></>}
                    </div>
```

(No new CSS class is required — `muted` exists; the inline `fontSize` keeps it secondary. Match the surrounding style if a `.leader-traits` rule is later desired.)

- [ ] **Step 2: Fix the Plan-1 happiness label.** In `src/engine/selectors.ts`, `happinessBreakdown`, the civ-ability line currently labels the entry with the civ name. Replace that `out.push({ label: <civ name>, amount: ... })` for the `empireCivic` ability with a clearer fixed label:

```ts
      out.push({ label: 'Leader ability', amount: ab.effect.happiness });
```

(If the implementer of Plan 1 wrote a different label expression there, replace whatever currently produces the civ-name label for the `uniqueAbility` happiness with the `'Leader ability'` label. Keep the amount logic unchanged.)

- [ ] **Step 3: Type-check + build.** Run `npx tsc -b` then `npm run build`. Expected: clean. (UI has no unit test here; correctness is the type-check plus the existing happiness-breakdown sum test still passing.)

- [ ] **Step 4: Run the happiness suite** to confirm the label change didn't break the breakdown-sums-to-net test: `npx vitest run tests/happiness.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/panels/ForeignAffairs.tsx src/engine/selectors.ts
git commit -m "feat(ui): Foreign Affairs shows leader traits and agenda; clearer ability label"
```

---

### Task 8: Full-suite verification, self-play re-tune, determinism

**Files:** possibly `tests/selfplay.test.ts` (re-seed only if a victory assertion shifts), no source changes expected.

- [ ] **Step 1: Run the full suite.** `npm test`. Traits + agenda factors change AI behavior and diplomacy, so the deterministic self-play victory seeds may land on a different victory/turn (exactly as in Plan 1's Babylon shift). If `tests/selfplay.test.ts` victory assertions fail:
  - Read the failure (which seed, what it now does).
  - Re-seed the affected assertion following the established pattern: scan nearby seeds (e.g. the failing seed ±10 in steps of 10) for one that still produces the asserted victory type at a comparable turn, and update the seed **with a comment** explaining the cause (a leader-traits behavior shift), mirroring the existing re-seed comments in that file. Do NOT weaken the assertion (it must still assert a real victory of the intended type).

- [ ] **Step 2: Confirm determinism holds.** `npx vitest run tests/replay.test.ts` must pass (bit-identical replay) — traits/agendas are pure functions of state and the hidden agenda uses a pure hash, so replays reproduce. If replay fails, something introduced nondeterminism (e.g., consumed `rngState` at init, or iterated an unsorted Record affecting output) — fix that rather than re-recording.

- [ ] **Step 3: Self-play telemetry sanity.** `npm run sim`. Confirm it completes and that civs now diverge (e.g., the warmonger Rome wars earlier; Babylon avoids war). No assertion added here.

- [ ] **Step 4: Build.** `npm run build` — clean.

- [ ] **Step 5: Commit any re-seed.**

```bash
git commit -am "test: re-tune self-play seeds for leader-traits behavior shift" || echo "nothing to commit"
```

---

## Self-review (spec coverage / placeholders / type consistency)

- **Traits (data + AI)** → Tasks 1,2 (data), 5 (AI: war, expansion, production, civics, diplomacy). ✓
- **Agendas (historical + seeded hidden) → attitude** → Tasks 1,2 (data), 3 (seeded hidden via pure hash), 4 (factors + reveal). ✓
- **Reactivity** → Task 4 (wonders/culture/religion/score factors, visible in the existing "why" panel) + Task 6 (attitude-shift toasts). ✓
- **Schema 6→7 + state** → Task 3. ✓
- **UI** → Task 7 (traits/agenda in Foreign Affairs) + the carried-over Plan-1 happiness-label fix. ✓
- **Determinism** → hidden agenda via pure hash (no `rngState` consumption, Task 3 test asserts `rngState` unchanged); all factors pure/integer; replay verified Task 8. ✓
- **Deferred (noted):** the `grudge`→`opinions[]` refactor (→ Plan 3, where events write memories); the pre-war "massing troops" tell (a later reactivity nicety — band-shift toward hostile already gives a pre-war signal); event modal + chronicle (→ Plan 3).
- **Placeholder scan:** the only soft spot is Task 5 Step 5's inline-`import(...)` type — the step gives the concrete fallback (type the param `Required<AiWeights>` and import `AiWeights`); implementer should use that. No "TODO"/"TBD".
- **Type consistency:** `AiWeights` keys, `traitWeights`/`wonderCount`/`commonReligion`/`agendaFactor`/`agendaKnown`/`considerWarForTest` names, `attitudeShift` event type, and `firstContactTurn`/`lastBand`/`hiddenAgenda`/`traits` fields are used identically across tasks and tests. ✓
