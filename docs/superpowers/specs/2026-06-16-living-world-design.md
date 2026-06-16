# Spec — The Living World

*2026‑06‑16. Sixth content track (schema 6 → 7). Turns Alvorada's correct‑but‑silent
simulation into a world that acts, reacts, and narrates itself. One cohesive answer:
**leaders are characters with opinions that remember why.***

Source audit & roadmap: `docs/2026-06-15-audit-and-roadmap.md`.
Design research: Soren Johnson (Civ IV / Old World) — depth from interesting decisions;
Old World event/opinion model; Civ VI agendas.

---

## 1. Goals

1. **Leaders feel distinct** — each civ plays differently (traits bias the AI) and *feels*
   differently about you (agendas bias attitude). Closes the "4 cosmetic civs" hole.
2. **The world acts on its own** — a deterministic event deck injects "something happened
   I didn't cause," with interactive choices as the centerpiece and ambient events as
   texture.
3. **The world reacts visibly** — opinion shifts, rival milestones, and pre‑war tells are
   surfaced, not buried.
4. **The game narrates itself** — a persistent Chronicle records the story of the playthrough.
5. **Civs gain identity** — a unique ability + unique unit + unique building each.

**Success criteria (verifiable):**
- All existing tests pass; `replay.test.ts` and `selfplay.test.ts` remain **bit‑identical**.
- New tests pass: events fire/gate/AI‑resolve and replay‑stably; traits measurably shift AI
  behavior; uniques are buildable only by their civ; agendas shift attitude; chronicle populates.
- A full 4‑player self‑play game deterministically produces ≥ 8 resolved events and a
  non‑empty chronicle (asserted in self‑play telemetry).
- Each of the 4 civs has a working UU, UB, and UA observable in a real game.
- Manual: an event modal appears with working choices; Chronicle panel reads the game's
  history; Foreign Affairs shows each rival's traits + agenda; ambient reactivity lines fire.

## 2. Non‑goals (deliberately deferred; hooks left where cheap)

- **Civilopedia / tooltips‑with‑effects / victory‑progress** → the *Legibility* track.
- **City‑states, great people, naval/rivers** → their own tracks.
- **Golden/Dark ages (era‑score)** and **timed/expiring effects** → later. All event effects
  in v1 are **instantaneous** (no duration‑bookkeeping subsystem).
- **Espionage** → hidden agendas are revealed by contact‑time as a stand‑in.
- **Yield *multipliers*** → all unique/effect values stay **additive/integer** (honors the
  breadth‑track rule). Cost/ratio effects use deterministic integer rounding.
- **Old World "families/courts"** → we model leader‑level traits/opinions only, not a full
  character roster.

## 3. Architecture (by layer — layering preserved: data → engine → ai → app → ui)

New/changed files:

| Layer | File | Change |
|---|---|---|
| data | `data/types.ts` | +`TraitDef`, `AgendaDef`, `EventDef`, `EventEffect`, `EventChoice`; extend `CivDef`, `UnitDef`, `BuildingDef` |
| data | `data/standard/traits.ts` | **new** — 8 trait defs (AI weight nudges, all data) |
| data | `data/standard/agendas.ts` | **new** — historical + hidden agenda defs (opinion rules) |
| data | `data/standard/events.ts` | **new** — ~24–30 event defs (the deck) |
| data | `data/standard/civs.ts` | + traits, agenda, uniqueAbility per civ |
| data | `data/standard/units.ts`, `buildings.ts` | + 4 unique units, 4 unique buildings (`civ`+`replaces`) |
| data | `data/standard/index.ts`, `data/validate.ts` | wire + cross‑validate new ids |
| engine | `engine/types.ts` | +`opinions`, `firstContactTurn` on `RelationState`; +`chronicle`, `pendingEvents`, per‑player `hiddenAgenda`, runtime `traits` |
| engine | `engine/systems/worldevents.ts` | **new** — candidate gather, deterministic draw, fire/resolve |
| engine | `engine/systems/chronicle.ts` | **new** — typed append helper |
| engine | `engine/diplomacy-eval.ts` | opinion‑sum attitude + agenda factor |
| engine | `engine/systems/turn.ts` | event check at turn start; opinion decay |
| engine | `engine/reducer.ts` | `EVENT_CHOICE` action; turn‑gate on pending event |
| engine | `engine/selectors.ts` | civ‑unique buildable swap; effective‑traits selector; agenda‑reveal selector |
| engine | `engine/systems/combat.ts`, `cities.ts` | chronicle hooks (war, capture, wonder, founding) |
| ai | `ai/decide.ts` | resolve `pendingEvent` → `EVENT_CHOICE` (pure, deterministic) |
| ai | `ai/economy.ts`, `ai/diplomacy.ts`, `ai/civics.ts` | consume trait weight nudges |
| app | `app/driver.ts` | route ambient‑event + chronicle notifications |
| ui | `ui/panels/EventModal.tsx` | **new** — choice cards w/ effect previews |
| ui | `ui/panels/Chronicle.tsx` | **new** — scrollable history, map‑jump |
| ui | `ui/panels/ForeignAffairs.tsx` | leader traits + agenda (hidden until revealed) |
| ui | `ui/MainMenu.tsx`, `ui/panels/TileInfo.tsx`/`CityPanel.tsx` | show civ uniques |
| ui | `ui/actions.ts`, `ui/GameScreen.tsx` | end‑turn gate on pending event; open Chronicle |

## 4. Data model

### 4.1 Traits (`traits.ts`) — AI behavior, pure data
```ts
TraitDef { id, name, blurb, weights: Partial<AiWeights> }
// AiWeights (consumed by ai/*): warThreshold, militaryPriority, expansionBias,
//   faithPriority, sciencePriority, culturePriority, goldPriority, defenseBias, dealWillingness
```
Catalog: `warmonger, expansionist, pious, scholarly, cultured, mercantile, defensive, diplomatic`.
Each leader has **2** static traits (CivDef); events may grant/strip traits at runtime
(stored per‑player; effective traits = static + acquired).

### 4.2 Agendas (`agendas.ts`) — opinion rules
```ts
AgendaDef { id, name, blurb, evaluate: OpinionRuleId }   // rule is data‑keyed, evaluated in engine
```
- Each leader: one **historical** agenda (revealed on meeting).
- Each leader: one **hidden** agenda drawn from `rngState` at init (deterministic per seed;
  per‑game variety). Concealed in UI until `turn − firstContactTurn ≥ REVEAL_TURNS` (ruleset const).
- Rules (data‑described, evaluated by a small engine switch over `OpinionRuleId`):
  `likesWonderBuilders, dislikesWarmongers, likesStrongMilitary, likesCultured,
  likesCoexistence, dislikesNeighbors, likesSharedReligion, …` → emit an `agendaRespected`/
  `agendaDefied` opinion modifier on the relation.

### 4.3 Opinion & memory (`engine/types.ts`)
```ts
RelationState += {
  opinions: { reason: OpinionReason, value: int, born: turn, decayPerTurn?: int }[],
  firstContactTurn?: turn,
}
```
`attitude(a,b)` = base + Σ opinions (decayed) — replacing the current flat factor list.
Existing `grudge` becomes opinion modifiers with `reason:'warOnMe'|'denounced'|'brokeDeal'`.
Reasons: `sharedReligion, denounced, brokeDeal, warOnMe, nearMyBorders, agendaRespected,
agendaDefied, wonderEnvy, admiredWonder, eventMemory`. Every reason has display text →
powers the ForeignAffairs "why" panel, reactivity toasts, and chronicle.

### 4.4 Events (`events.ts`)
```ts
EventDef {
  id, title, body,                        // body = flavor text
  trigger: EventTrigger,                  // when eligible to be considered
  requirements?: Requirement[],           // extra state gates (sorted‑evaluated)
  weight: int,                            // selection weight among candidates
  oncePerGame?: bool,
  choices: EventChoice[]                   // length 0 ⇒ ambient (auto‑resolve)
}
EventChoice { text, effects: EventEffect[], aiBias?: int }
EventEffect =                              // bounded vocabulary, all integer/additive
  | {k:'gold', n} | {k:'yield', y, n, scope:'city'|'empire'} | {k:'unit', unit, where}
  | {k:'happiness', n} | {k:'popLoss', n} | {k:'revealRadius', n}
  | {k:'spawnBarbarians', n} | {k:'addTrait', trait} | {k:'removeTrait', trait}
  | {k:'opinion', who:'random_met'|'all_met', reason, value} | {k:'chronicle', text}
// All effects are INSTANTANEOUS — one‑shot grants, no timed/expiring effects in v1.
// 'yield' with y:'faith' covers faith grants; 'revealRadius' reveals around a random owned tile.
```
**Triggers** (sorted, deterministic): `turnInterval`, `onCityGrew`, `onWar`, `onReligionFounded`,
`onWonderBuilt`, `onCapture`, `onEra`, `onUnhappy`, `onIdleGold`, etc.

**Representative catalog** (the ~24–30 v1 deck spans these; choice events marked ◆, ambient ○):

| Event | Trigger | Sketch |
|---|---|---|
| ◆ City Festival | onCityGrew | spend gold for happiness, or pocket it (memory: your people remember) |
| ◆ Migrants Arrive | turnInterval | settle them (+pop) vs turn away (+order) vs conscript (+unit) |
| ◆ Rebel Uprising | onUnhappy | crush (spawn barbarians near city) vs concede (lose gold, gain order) |
| ◆ Mineral Strike | turnInterval+hills | invest (gold→prod) vs sell rights (gold now) |
| ◆ Wandering Scholar | turnInterval+writing | host (+science, addTrait scholarly) vs ignore |
| ◆ Religious Miracle | onReligionFounded | proclaim (+faith, opinion w/ co‑religionists) vs stay humble |
| ◆ Succession Question | turnInterval (era≥classical) | grants/strips a leader trait depending on choice |
| ◆ Border Incident | nearMyBorders rival | demand apology (agendaDefied opinion) vs let it pass |
| ○ Bountiful Harvest | onCityGrew | +food/pop; chronicle line |
| ○ Plague | turnInterval (large city) | popLoss; chronicle line |
| ○ Barbarian Warlord | onWar/turnInterval | spawnBarbarians escalation; chronicle line |
| ○ Omen in the Sky | onEra | flavor + small yield; marks the era turn in the chronicle |

Loose‑coupled (Old World model): each event tests state independently; no scripted trees, so
the deck can grow without touching existing events.

### 4.5 State additions
```ts
GameState += {
  chronicle: ChronicleEntry[],                 // append‑only
  pendingEvents: Record<PlayerId, ActiveEvent|null>,  // ActiveEvent = {eventId, choices}
}
Player += { hiddenAgenda: AgendaId, traits: TraitId[] /* runtime, init from CivDef */ }
ChronicleEntry { turn, kind, text, q?, r?, player? }
```

### 4.6 Civ uniques (`units.ts`/`buildings.ts` + selector)
Add `civ?: CivId` and `replaces?: BaseId` to `UnitDef`/`BuildingDef`. Buildable‑list selector:
when player's civ has a def with `replaces === base && civ === me`, offer it instead of the base.
`CivDef.uniqueAbility: EffectId[]` applied as an empire‑wide passive via the same path policies
use (extend the policy/belief effect vocabulary with the few additive entries below).

| Civ | UA (additive/integer; tuned via sim) | UU (replaces) | UB (replaces) | Traits / historical agenda |
|---|---|---|---|---|
| Rome | Pax Romana — +1 happiness in each city with a military garrison | Legion (Swordsman): +str, +city‑attack | Bath (Aqueduct): +1 happiness | warmonger, expansionist / *likesStrongMilitary* |
| Egypt | Iteru — +2 production toward Wonders | War Chariot (Horseman): +1 move on flat | Nilometer (Granary): +1 faith | cultured, defensive / *likesWonderBuilders* |
| Babylon | Cradle of Learning — +1 science/city; a free tech when you build your first Library (cheapest researchable, tie‑break by id) | Bowman (Archer): +ranged str | Etemenanki (Library): +1 science, +1 culture | scholarly, diplomatic / *dislikesWarmongers* |
| Hellas | Hellenic League — +1 culture/city | Hoplite (Spearman): +str, +vs‑mounted | Acropolis (Monument): +1 culture | cultured, pious / *likesCultured* |

## 5. Event system flow (determinism‑critical)

1. **Turn start** (`turn.ts`, after yields): if the player has no `pendingEvent`, gather
   candidates = events whose `trigger` + `requirements` hold (iterate `rules.events` **sorted by id**).
2. Roll `drawInt(rngState, 0, 10000) < chancePerTurn` (ruleset const, scaled by candidate count).
   If no fire, continue.
3. Weighted‑select one candidate via `rngState` (sorted, cumulative‑weight, drawInt).
4. **Has choices + human** → set `pendingEvents[player]`; **end‑turn gated** (extend
   `turnGate` in `ui/actions.ts`, same machinery as research/production/idle). UI shows
   `EventModal`. Player picks → `EVENT_CHOICE {player, eventId, choiceIndex}` (logged action)
   → apply effects, push chronicle, clear pending.
5. **Has choices + AI** → `ai/decide.ts` detects `pendingEvents[me]` and returns `EVENT_CHOICE`
   with index = argmax(`utility(effects) + aiBias + traitNudge`), tie‑break by lowest index
   (pure function; no RNG).
6. **No choices (ambient)** → apply effects immediately, push chronicle + toast.

**Determinism guarantees:** all randomness via `rngState`; candidate gather & weight scan are
sorted; AI choice is a pure function; human choice is a logged action. Replay reapplies the
identical action stream over the identical RNG → bit‑identical (enforced by `replay.test.ts`).

## 6. AI behavior (traits → existing decision points)

Trait `weights` are summed into the AI's existing scoring, no new decision *loops*:
- `ai/economy.ts` production cascade & `desiredCities`: `militaryPriority`, `expansionBias`,
  `faith/science/culture/goldPriority` nudge the existing priority order and wonder/unit picks.
- `ai/decide.ts` war check: `warThreshold` shifts the existing power‑ratio gate.
- `ai/civics.ts`: `faith/culturePriority` bias belief/policy picks (replacing `pid % count`).
- `ai/diplomacy.ts`: `dealWillingness`, `defenseBias` shift peace/friendship thresholds.
- Agenda factor lives in the **shared engine eval** (`diplomacy-eval.ts`) so AI and the UI
  "why" panel agree. AI still uses only its own fog (fair AI).

## 7. Reactivity surfacing

- Feed agenda + wonders + score‑gap into `attitude()` via opinion modifiers (§4.3).
- Track previous attitude band per relation; on a band crossing → chronicle entry + toast
  ("Hammurabi has grown wary of your expansion").
- World feed: rival wonder/religion/war/era milestones broadcast to all who've met them
  (extend `driver.ts` audience routing; many events are already `player:null`).
- Pre‑war tell: when the AI campaign system stages a host adjacent to the player, emit
  "Caesar is massing troops near Thebes".

## 8. UI

- **EventModal** — chamfered plate, title + flavor body, choice buttons each previewing
  their effects via `icons.tsx`; blocks via the pending‑event gate. (Ambient events are toasts.)
- **Chronicle panel** — scrollable, grouped by era/turn; click an entry with `q/r` to jump
  the map. Opened from a HudRight/TopBar control.
- **ForeignAffairs** — leader name + 2 trait chips + historical agenda always; hidden agenda
  shown once `firstContactTurn` threshold passes; agenda factor appears in the existing "why" list.
- **MainMenu civ‑select** + **TileInfo/CityPanel** — surface each civ's UA/UU/UB (no pedia yet).
- No new icon family; reuse `icons.tsx`. Motion per DESIGN.md (panel slide/fade).

## 9. Determinism, schema, validation

- `SCHEMA_VERSION` 6 → 7; old autosaves dropped on load (established pattern, no migrator).
- `data/validate.ts`: every `civ`/`replaces`/`trait`/`agenda`/`effect`/`event` id cross‑checks;
  each `replaces` target exists; each unique's `civ` exists; event effects reference valid ids;
  no event references an undefined trait/effect.
- No `Math.random`/`Date`/transcendentals in engine/ai; sorted Record iteration; the existing
  determinism guards in tests are the backstop.

## 10. Testing

- `worldevents.test.ts` — eligibility gating; deterministic fire & selection from a fixed
  seed; end‑turn gate on pending; AI auto‑resolves; **replay reproduces** an event‑heavy game.
- `leaders.test.ts` — a `warmonger` AI declares war earlier than a `diplomatic` one (same map/seed);
  uniques buildable only by their civ; base unit/building hidden when replaced; UA applies.
- `agendas.test.ts` — respecting/defying an agenda moves attitude in the expected direction;
  hidden agenda hidden before reveal turn, shown after.
- `chronicle.test.ts` — founding/war/wonder/era push the right entries.
- Extend `selfplay.test.ts` telemetry: assert ≥ 8 events resolved and chronicle non‑empty across
  a full deterministic game; print event/trait/agenda histograms.
- `npm run sim` balance pass on civ uniques + event effect magnitudes; `node scripts/shot.mjs`
  screenshots of the EventModal, Chronicle, and Foreign Affairs.

## 11. Confirmed decisions (revisitable at review)

1. Events fire at the **player's turn start** (a modal may greet you).
2. Hidden agenda revealed by **contact‑time** (`REVEAL_TURNS`), no espionage.
3. Unique units **replace** their base (Legion instead of Swordsman), not stack.
4. **~24–30** events in the v1 catalog; loose‑coupled so more can be added without trees.
5. Unique/effect values are **additive/integer**, tuned via self‑play.

## 12. Suggested build order (for the implementation plan)

1. **Schema + data model + validation** (types, empty catalogs, schema bump). Ships nothing, unblocks all.
2. **Civ uniques** (mechanism + content + tests) — self‑contained, independently shippable.
3. **Opinion/memory refactor** (grudge → opinions; attitude = opinion sum) + tests (keep behavior parity first).
4. **Agendas + reactivity** (agenda factor, band‑change toasts, world feed, pre‑war tell) + tests.
5. **Traits → AI** (weight nudges into existing scoring) + self‑play telemetry.
6. **Event deck engine** (gather/draw/fire, `EVENT_CHOICE`, gate, AI resolve, ambient) + tests.
7. **Event catalog** (~24–30) + tuning.
8. **UI** (EventModal, Chronicle, ForeignAffairs, civ‑unique surfaces, end‑turn gate).
9. **Balance + determinism verification** (`npm run sim`, screenshots, full test + build).

Each step keeps tests green and the build type‑clean before the next.
