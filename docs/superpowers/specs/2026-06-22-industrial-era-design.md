# Industrial Era Design (Modern-Era Arc, Spec A of N)

**Status:** Approved (2026-06-22)
**Context:** First slice of the deferred "modern-era tech tree" (the XL roadmap item). Decomposed era-by-era; this adds **one era (Industrial)**, land/sea content only — **no air domain, no nukes** (those are later eras' decisions). Ship → re-tune → playtest → then decide Modern.

## Goal

Extend the tech tree one era past the Renaissance into the Industrial age: ~6 techs, three land/sea units, two buildings, a strategic resource (coal), two wonders — and **move the science-victory capstone into the new era** (so the new content is actually reached in a science race) with a turn-limit bump.

## Engine fit (no new mechanics)

The ruleset is fully data-driven: a tech unlocks nothing directly — units/buildings/improvements/resources point *at* it via `requiresTech`. Wonders are buildings with `wonder: true` + an `effect` from the existing vocabulary (`empireYields`/`cityDefense`/`freeUnit`/`freeTech`/`cultureBurst`/`happiness`). The science capstone is a single settings field (`victory.scienceCapstone`) consumed by `checkScienceVictory` + `capstoneClosure`. So this whole spec is **ruleset data + one settings change** — no new state, **no schema bump**.

## Components

### 1. Era + techs
Add `{ id: 'industrial', name: 'Industrial Era' }` to `ERAS` (`src/data/standard/techs.ts`). Add 6 techs (cols 10–11, costs scaling past the Renaissance ~260–400 band):

| id | name | prereqs | cost | pos | unlocks |
|---|---|---|---|---|---|
| `economics` | Economics | [banking] | 440 | {10,1} | Stock Exchange |
| `industrialization` | Industrialization | [banking, chemistry] | 460 | {10,2} | Factory; reveals Coal |
| `rifling` | Rifling | [metallurgy] | 460 | {10,4} | Rifleman |
| `steam_power` | Steam Power | [chemistry, scientific_method] | 480 | {11,3} | Ironclad |
| `ballistics` | Ballistics | [rifling] | 520 | {11,4} | Artillery |
| `electricity` | Electricity | [industrialization, scientific_method] | 560 | {11,1} | **science capstone** + Eiffel Tower |

The science path is `… → scientific_method → industrialization → electricity` (two techs deeper than today); the rest are military/economic side branches.

### 2. Victory change (the balance crux)
In `src/data/standard/index.ts` `settings.victory`:
- `scienceCapstone: 'scientific_method'` → **`'electricity'`**
- `turnLimit: 260` → **`300`**

`checkScienceVictory` fires on researching `electricity`; `capstoneClosure(electricity)` BFS pulls in the whole tree (electricity → industrialization → banking/chemistry → … and → scientific_method) so victory *progress* reflects the full tree. The longer race needs the turn bump; the culture `minTurn`/`dominanceFactor` stay as-is but their seeds will move (see Determinism).

### 3. Units (`src/data/standard/units.ts`) — land/sea only
| id | class | strength | ranged | tech | resource | notes |
|---|---|---|---|---|---|---|
| `rifleman` | melee/land | 36 | — | `rifling` | — | line infantry; obsoletes musketman |
| `artillery` | siege/land | 12 | 42 @2 | `ballistics` | — | `{vsCity:100}`; obsoletes cannon |
| `ironclad` | ranged/sea | 28 | 36 @2 | `steam_power` | `coal` | steam warship; obsoletes frigate |

(Stats are starting points; costs ~150–180, moves 2/2/4, mirroring the existing tiers. Glyphs reuse `sword`/`catapult`/`bow`.)

### 4. Obsolescence extension (`obsoletedBy`, from Batch 3)
The Batch-3 "latest tier" units now have successors:
- `musketman` → `rifling`
- `cannon` → `ballistics`
- `frigate` → `steam_power`

New latest-tier (no `obsoletedBy`): rifleman, artillery, ironclad. Unchanged from Batch 3: cuirassier stays the latest mounted unit (no Industrial cavalry this slice); galleass keeps its `metallurgy` gate (frigate still supersedes it). The full sea chain is now galley → galleass (→metallurgy) → frigate (→steam_power) → ironclad.

### 5. Buildings (`src/data/standard/buildings.ts`)
- **`factory`** — `yields: { production: 5 }`, `requiresTech: 'industrialization'`, cost ~180. The era's production engine.
- **`stock_exchange`** — `yields: { gold: 5 }`, `specialistSlots: { type: 'merchant', count: 1 }`, `requiresTech: 'economics'`, cost ~160. (Add to the AI's `BUILDING_PRIORITY` so the AI builds them — this is part of the re-tune.)

### 6. Strategic resource — Coal (`src/data/standard/resources.ts`)
```ts
coal: { id: 'coal', name: 'Coal', kind: 'strategic', yields: { production: 1 },
        revealedBy: 'industrialization', improvedBy: 'mine', bonusImproved: { production: 1 },
        spawn: { terrains: ['grassland', 'plains', 'tundra'], elevations: ['hill', 'flat'], weight: 6 } },
```
Mirrors Iron. It gates the Ironclad (`requiresResource: 'coal'`) and flows through the existing map-gen weighted-resource + per-start strategic fairness passes — which **shifts every seed's resource layout** (part of the re-tune). Needs a resource icon in the renderer (reuse/extend the game-icons set).

### 7. Wonders (2, `src/data/standard/buildings.ts`)
- **Big Ben** — `wonder: true, effect: { kind: 'empireYields', yields: { gold: 1 } }`, `requiresTech: 'economics'`.
- **Eiffel Tower** — `wonder: true, effect: { kind: 'empireYields', yields: { culture: 1 } }`, `requiresTech: 'electricity'`.

(Reuse existing effect kinds + glyphs; one-per-game like all wonders.)

### 8. UI
The tech tree (`TechTree.tsx`) lays out by `pos`, so cols 10–11 render automatically. The era ceremony (Legibility) keys off `ERAS`/`currentEra`, so the Industrial banner works once the era exists. New units render via their `art.glyph` (existing glyphs). Coal needs a resource icon. No new improvement painters (coal uses the existing mine).

## Determinism — the heaviest re-tune in the project

Adding an era + **moving the science capstone** + **extending the turn limit** + **a new map-gen resource** shifts *every* self-play trajectory. Expect to re-tune:
- **The science-victory self-play test** — must now assert the **`electricity`** capstone reached, and every hardcoded `runGame(seed, 265)` turn count moves to ~**305** (past the new 300 limit). Re-seed for a game that reaches `electricity` by the limit.
- **The culture-victory seed** (the longer arc + new resource layout will move it).
- The "reaches a verdict by the turn limit" and any other turn-count-sensitive self-play tests (update 265 → ~305).

This is the balance event flagged when we scoped this. Handle with the usual protocol: sweep for new seeds, update `tests/selfplay.test.ts` + its comment history, **never weaken the victory assertions**, and confirm bit-identical replay still holds. **The full self-play suite is the gate.**

## Testing

New `tests/industrial-era.test.ts`:
1. **Gating:** `rifleman`/`artillery` need their tech; `ironclad` needs `steam_power` + `coal` + a coastal city; `factory`/`stock_exchange` need their tech (`canProduce`).
2. **Obsolescence extends:** `musketman` is obsolete once `rifling` held; `cannon` once `ballistics`; `frigate` once `steam_power`.
3. **Capstone:** `victory.scienceCapstone === 'electricity'`; `capstoneClosure` includes `scientific_method` and the renaissance chain (so progress reflects the full tree); `checkScienceVictory` fires on researching `electricity`, not `scientific_method`.
4. **Coal:** revealed only with `industrialization` (`resourceRevealed`).

Plus the **self-play re-tune** (its own task): re-seed the science (electricity) + culture victories under the 300-turn limit; full `npm test` green; `npm run build` (tsc) clean.

## File-touch summary

- `src/data/standard/techs.ts` — `industrial` era + 6 techs.
- `src/data/standard/units.ts` — rifleman/artillery/ironclad + `obsoletedBy` on musketman/cannon/frigate.
- `src/data/standard/buildings.ts` — factory, stock_exchange, Big Ben, Eiffel Tower.
- `src/data/standard/resources.ts` — coal.
- `src/data/standard/index.ts` — `victory.scienceCapstone`/`turnLimit`.
- `src/ai/economy.ts` — add factory/stock_exchange to `BUILDING_PRIORITY`.
- `src/ui/map/art.ts` (or the resource-icon table) — coal icon.
- `tests/industrial-era.test.ts` — new tests.
- `tests/selfplay.test.ts` — re-seed science (electricity) + culture; bump turn counts to ~305.

## No schema change

All ruleset data + a settings change. No new `GameState` fields; no `SCHEMA_VERSION` bump.

## Out of scope (later eras / specs)

Modern + Atomic/Information eras; the **air domain**; **nukes**; oil/uranium; a longer victory restructure beyond this one capstone move. Decided after this ships and is played.
