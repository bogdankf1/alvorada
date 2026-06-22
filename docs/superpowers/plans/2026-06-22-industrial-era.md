# Industrial Era Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Industrial era — 6 techs, 3 land/sea units, 2 buildings, 2 wonders, a Coal resource — and move the science-victory capstone to `electricity` with a turn-limit bump.

**Architecture:** Ruleset data + one settings change (no new mechanics, no schema bump). The big work is the **self-play re-tune** (Task 5) after the capstone/turn-limit move.

**Tech Stack:** TypeScript, Vitest. Deterministic data-driven engine; self-play replay is the gate.

**Spec:** `docs/superpowers/specs/2026-06-22-industrial-era-design.md`

---

## File Structure

- `src/data/standard/techs.ts` — `industrial` era + 6 techs.
- `src/data/standard/index.ts` — `victory.scienceCapstone` / `turnLimit`.
- `src/data/standard/units.ts` — rifleman/artillery/ironclad + `obsoletedBy` on musketman/cannon/frigate.
- `src/data/standard/buildings.ts` — factory, stock_exchange, Big Ben, Eiffel Tower.
- `src/data/standard/resources.ts` — coal.
- `src/ai/economy.ts` — factory/stock_exchange in `BUILDING_PRIORITY`.
- `src/ui/map/resource-icons.ts` — coal icon.
- `tests/industrial-era.test.ts` — new tests.
- `tests/selfplay.test.ts` — re-seed + turn-count bumps (Task 5).

**Important:** Tasks 1–4 change the capstone/turn-limit/resource pool, which **breaks the existing self-play victory tests**. That is expected — each of Tasks 1–4 runs only its own fast unit tests; the full `npm test` + the self-play re-tune happen in **Task 5**. Do not try to keep `npm test` green between tasks.

---

## Task 1: Industrial era + techs + capstone/turn move

**Files:**
- Modify: `src/data/standard/techs.ts`, `src/data/standard/index.ts`
- Test: `tests/industrial-era.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/industrial-era.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ctx } from './helpers';

describe('industrial era + capstone', () => {
  it('the science capstone is electricity', () => {
    expect(ctx.rules.settings.victory.scienceCapstone).toBe('electricity');
  });
  it('the turn limit is bumped to 300', () => {
    expect(ctx.rules.settings.victory.turnLimit).toBe(300);
  });
  it('electricity exists in the industrial era and its prereq closure pulls in the whole tree', () => {
    const e = ctx.rules.techs['electricity'];
    expect(e?.era).toBe('industrial');
    // BFS the prereq closure
    const seen = new Set<string>(); const stack = ['electricity'];
    while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); for (const p of ctx.rules.techs[id].prereqs) stack.push(p); }
    expect(seen.has('scientific_method')).toBe(true);
    expect(seen.has('chemistry')).toBe(true);
    expect(seen.has('industrialization')).toBe(true);
  });
  it('the industrial era is registered', () => {
    expect(ctx.rules.eras.some((e) => e.id === 'industrial')).toBe(true);
  });
});
```
(Confirm `ctx.rules.eras` is the right accessor for the ERAS list — check `src/data/standard/index.ts` / how the ruleset exposes eras; adjust if it's `ctx.rules.eras` vs another name.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/industrial-era.test.ts`
Expected: FAIL — capstone is still `scientific_method`, no `electricity` tech, no `industrial` era.

- [ ] **Step 3: Add the era + techs**

In `src/data/standard/techs.ts`, add to `ERAS` (after renaissance):
```ts
  { id: 'industrial', name: 'Industrial Era' },
```
Add 6 techs to `TECHS`:
```ts
  economics: { id: 'economics', name: 'Economics', era: 'industrial', cost: 440, prereqs: ['banking'], pos: { col: 10, row: 1 } },
  industrialization: { id: 'industrialization', name: 'Industrialization', era: 'industrial', cost: 460, prereqs: ['banking', 'chemistry'], pos: { col: 10, row: 2 } },
  rifling: { id: 'rifling', name: 'Rifling', era: 'industrial', cost: 460, prereqs: ['metallurgy'], pos: { col: 10, row: 4 } },
  steam_power: { id: 'steam_power', name: 'Steam Power', era: 'industrial', cost: 480, prereqs: ['chemistry', 'scientific_method'], pos: { col: 11, row: 3 } },
  ballistics: { id: 'ballistics', name: 'Ballistics', era: 'industrial', cost: 520, prereqs: ['rifling'], pos: { col: 11, row: 4 } },
  electricity: { id: 'electricity', name: 'Electricity', era: 'industrial', cost: 560, prereqs: ['industrialization', 'scientific_method'], pos: { col: 11, row: 1 } },
```

- [ ] **Step 4: Move the capstone + bump the turn limit**

In `src/data/standard/index.ts` `settings.victory`, change `scienceCapstone: 'scientific_method'` → `scienceCapstone: 'electricity'` and `turnLimit: 260` → `turnLimit: 300`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/industrial-era.test.ts`
Expected: PASS (4).

- [ ] **Step 6: Commit**

```bash
git add src/data/standard/techs.ts src/data/standard/index.ts tests/industrial-era.test.ts
git commit -m "feat(data): Industrial era + techs; science capstone -> electricity, turn limit 300"
```

---

## Task 2: Industrial units + obsolescence extension

**Files:**
- Modify: `src/data/standard/units.ts`
- Test: `tests/industrial-era.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `tests/industrial-era.test.ts` (add `import { flatWorld, spawn, refreshVis, thaw } from './helpers'; import { canProduce } from '../src/engine/selectors'; import { applyAction } from '../src/engine/reducer'; import { tileIndex } from '../src/engine/hex';`):
```ts
describe('industrial units', () => {
  function coastalCity(techs: string[]) {
    let s = flatWorld(18, 12, 2);
    for (let r = 0; r < s.mapH; r++) for (let q = 8; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
    }
    const settler = spawn(s, 0, 'settler', 7, 5); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id }); s = thaw(s);
    s.players[0].techs.push(...techs);
    return { s, id: Object.keys(s.cities).map(Number)[0] };
  }
  it('rifleman needs rifling; artillery needs ballistics', () => {
    const { s, id } = coastalCity([]);
    const c = s.cities[id];
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'rifleman' }).ok).toBe(false);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'artillery' }).ok).toBe(false);
    s.players[0].techs.push('rifling', 'ballistics');
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'rifleman' }).ok).toBe(true);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'artillery' }).ok).toBe(true);
  });
  it('ironclad needs steam_power AND coal (and a coastal city)', () => {
    const { s, id } = coastalCity(['steam_power']); // coastal, tech, but no coal
    expect(canProduce(ctx, s, s.cities[id], { kind: 'unit', id: 'ironclad' }).ok).toBe(false); // needs coal
  });
  it('obsolescence extends: musketman→rifling, cannon→ballistics, frigate→steam_power', () => {
    const { s, id } = coastalCity(['gunpowder', 'metallurgy']); // can build musketman/cannon/frigate
    const c = s.cities[id];
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'musketman' }).ok).toBe(true);
    s.players[0].techs.push('rifling', 'ballistics', 'steam_power');
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'musketman' }).ok).toBe(false);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'cannon' }).ok).toBe(false);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'frigate' }).ok).toBe(false);
  });
});
```
(Note: `cannon` also `requiresResource: 'iron'` — so its `canProduce` may already fail on iron; the obsolescence assertion still holds since obsolete is one of the failure reasons. If you want a clean obsolescence-only assertion for cannon, check the `reason` is `obsolete` after pushing `ballistics`. Adjust if iron-gating muddies it — testing `musketman`/`frigate` (no resource gate) is the cleanest; keep cannon as a secondary check.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/industrial-era.test.ts -t "industrial units"`
Expected: FAIL — rifleman/artillery/ironclad are unknown units.

- [ ] **Step 3: Add the units + obsolescence**

In `src/data/standard/units.ts`, add (near the other late-game units, matching the existing single-line style):
```ts
  rifleman: {
    id: 'rifleman', name: 'Rifleman', cost: 150, moves: 2, sight: 2, strength: 36,
    class: 'melee', domain: 'land', requiresTech: 'rifling', art: { glyph: 'sword' },
  },
  artillery: {
    id: 'artillery', name: 'Artillery', cost: 170, moves: 2, sight: 2, strength: 12,
    ranged: { strength: 42, range: 2 }, class: 'siege', domain: 'land',
    bonuses: [{ vsCity: true, pct: 100 }], requiresTech: 'ballistics', art: { glyph: 'catapult' },
  },
  ironclad: {
    id: 'ironclad', name: 'Ironclad', cost: 180, moves: 4, sight: 3, strength: 28,
    ranged: { strength: 36, range: 2 }, class: 'ranged', domain: 'sea',
    requiresTech: 'steam_power', requiresResource: 'coal', art: { glyph: 'bow' },
  },
```
Add `obsoletedBy` to the existing defs:
- `musketman`: `obsoletedBy: 'rifling'`
- `cannon`: `obsoletedBy: 'ballistics'`
- `frigate`: `obsoletedBy: 'steam_power'`

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/industrial-era.test.ts -t "industrial units"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/standard/units.ts tests/industrial-era.test.ts
git commit -m "feat(data): Industrial units (rifleman/artillery/ironclad) + obsolescence extension"
```

---

## Task 3: Buildings, wonders, coal, AI priority

**Files:**
- Modify: `src/data/standard/buildings.ts`, `src/data/standard/resources.ts`, `src/ai/economy.ts`
- Test: `tests/industrial-era.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `tests/industrial-era.test.ts` (add `import { resourceRevealed } from '../src/engine/selectors';`):
```ts
describe('industrial buildings + coal', () => {
  function city(techs: string[]) {
    const s = flatWorld(16, 12, 2);
    s.players[0].techs.push(...techs);
    return { s, c: { q: 6, r: 6, owner: 0, buildings: [] as string[], pop: 3 } as any };
  }
  it('factory needs industrialization; stock_exchange needs economics', () => {
    const { s, c } = city([]);
    expect(canProduce(ctx, s, c, { kind: 'building', id: 'factory' }).ok).toBe(false);
    expect(canProduce(ctx, s, c, { kind: 'building', id: 'stock_exchange' }).ok).toBe(false);
    s.players[0].techs.push('industrialization', 'economics');
    expect(canProduce(ctx, s, c, { kind: 'building', id: 'factory' }).ok).toBe(true);
    expect(canProduce(ctx, s, c, { kind: 'building', id: 'stock_exchange' }).ok).toBe(true);
  });
  it('coal is revealed only with industrialization', () => {
    const { s } = city([]);
    expect(resourceRevealed(ctx, s, 0, 'coal')).toBe(false);
    s.players[0].techs.push('industrialization');
    expect(resourceRevealed(ctx, s, 0, 'coal')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/industrial-era.test.ts -t "industrial buildings"`
Expected: FAIL — unknown building `factory`; coal unknown.

- [ ] **Step 3: Add the buildings + wonders**

In `src/data/standard/buildings.ts`, add:
```ts
  factory: { id: 'factory', name: 'Factory', cost: 180, yields: { production: 5 }, requiresTech: 'industrialization', art: { glyph: 'hammer' } },
  stock_exchange: { id: 'stock_exchange', name: 'Stock Exchange', cost: 160, yields: { gold: 5 }, specialistSlots: { type: 'merchant', count: 1 }, requiresTech: 'economics', art: { glyph: 'coin' } },
  big_ben: { id: 'big_ben', name: 'Big Ben', cost: 320, yields: { gold: 3 }, wonder: true, effect: { kind: 'empireYields', yields: { gold: 1 } }, requiresTech: 'economics', art: { glyph: 'coin' } },
  eiffel_tower: { id: 'eiffel_tower', name: 'Eiffel Tower', cost: 340, yields: { culture: 3 }, wonder: true, effect: { kind: 'empireYields', yields: { culture: 1 } }, requiresTech: 'electricity', art: { glyph: 'obelisk' } },
```
(Confirm the glyph ids exist in the renderer/glyph set; reuse existing ones — `hammer`, `coin`, `obelisk` are in the data already.)

- [ ] **Step 4: Add coal**

In `src/data/standard/resources.ts` RESOURCES:
```ts
  coal: { id: 'coal', name: 'Coal', kind: 'strategic', yields: { production: 1 }, revealedBy: 'industrialization', improvedBy: 'mine', bonusImproved: { production: 1 }, spawn: { terrains: ['grassland', 'plains', 'tundra'], elevations: ['hill', 'flat'], weight: 6 } },
```

- [ ] **Step 5: AI builds the new buildings**

In `src/ai/economy.ts`, add `'factory'` and `'stock_exchange'` to the `BUILDING_PRIORITY` array (place `factory` after `'workshop'`, `stock_exchange` after `'bank'`). Wonders are picked via the existing wonders pass — no list change needed for Big Ben/Eiffel Tower.

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tests/industrial-era.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 7: Commit**

```bash
git add src/data/standard/buildings.ts src/data/standard/resources.ts src/ai/economy.ts tests/industrial-era.test.ts
git commit -m "feat(data): factory/stock_exchange + Big Ben/Eiffel Tower wonders + Coal resource"
```

---

## Task 4: Coal map icon

**Files:**
- Modify: `src/ui/map/resource-icons.ts`

- [ ] **Step 1: Add the coal icon**

In `src/ui/map/resource-icons.ts`, add a `coal` entry to `RESOURCE_ICON_PATHS` (an SVG path string in the same viewBox as the others — a simple coal-lump / rock silhouette from the game-icons set, or reuse a dark mineral path already present, e.g. the same path as `iron`/`stone` recolored). The goal is that coal tiles render a token instead of nothing.

- [ ] **Step 2: Build sanity**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/map/resource-icons.ts
git commit -m "feat(ui): coal resource map icon"
```

---

## Task 5: Self-play re-tune + full-suite gate

The capstone moved to `electricity` and the turn limit to 300, so the self-play victory tests need re-seeding and turn-count bumps. This is the heaviest task.

**Files:**
- Modify: `tests/selfplay.test.ts`

- [ ] **Step 1: Bump the turn counts**

In `tests/selfplay.test.ts`, every hardcoded run-past-the-limit count moves from 265/260 to **305**:
- `runGame(60221, 265)` → `runGame(60221, 305)` (the "reaches a verdict by the turn limit" test).
- `runGame(314, 265)` → re-seeded (Step 2).
- `runGame(960, 265)` → re-seeded (Step 3).
- `runGame(4242, 260)` → `runGame(4242, 305)` (religion test) — re-seed only if it fails.

- [ ] **Step 2: Re-seed the SCIENCE victory (now electricity)**

The science test must now assert the **electricity** capstone. Update it to:
```ts
    const { state } = runGame(/* NEW_SCIENCE_SEED */ 314, 305);
    expect(state.phase).toBe('ended');
    expect(state.winner?.victory).toBe('science');
    expect(state.players[state.winner!.player].techs).toContain('electricity');
```
Then sweep for a seed where an AI reaches `electricity` (the new capstone) and wins science by turn 300. Write a throwaway scratch (like prior re-tunes) running candidate seeds to 305 and logging `winner.victory` + whether `electricity` is held; pick the first science-win seed. Replace `NEW_SCIENCE_SEED` and append a one-line reason to the comment block ("Re-seeded X→Y: capstone moved to electricity + turn limit 300 (Industrial era)"). Delete the scratch.

- [ ] **Step 3: Re-seed the CULTURE victory**

Likewise sweep for a culture-win seed under the 300-turn limit (the longer arc + coal resource layout moved seed 960). Update `runGame(<seed>, 305)`, keep the `culture` assertion, append the re-seed reason.

- [ ] **Step 4: Build (tsc) + full suite**

Run: `npm run build` (clean), then `npm test`.
Expected: ALL green. The replay/`gameHash` determinism tests must still pass (the engine is still deterministic; only content/balance changed). If a non-victory self-play test (breadth/economy/religion/combat) fails on a turn-count or milestone, bump its turns to 305 and/or re-seed it the same way, documenting why.

- [ ] **Step 5: Commit**

```bash
git add tests/selfplay.test.ts
git commit -m "test: re-tune self-play for the Industrial era (electricity capstone, turn limit 300)"
```

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** era+techs+capstone/turn (T1), units+obsolescence (T2), buildings+wonders+coal+AI (T3), coal icon (T4), self-play re-tune (T5). All spec sections covered. ✓
- **Determinism:** the re-tune is explicit (T5) with the documented re-seed protocol; replay determinism is preserved (only data/balance changed, engine untouched). Tasks 1–4 intentionally don't run the full suite (it's known-broken until T5) — flagged up front. ✓
- **Type consistency:** new techs use `{id,name,era,cost,prereqs,pos}`; units `{...,requiresTech,requiresResource?,obsoletedBy?}`; buildings `{...,wonder?,effect?,specialistSlots?}`; coal mirrors `iron`. `victory.scienceCapstone`/`turnLimit` are the existing settings fields. ✓
- **Placeholder scan:** no TBD/TODO; `NEW_SCIENCE_SEED`/culture seed are filled by the T5 sweeps (explicit steps), like every prior re-tune. The coal icon (T4) is build-sanity (canvas), consistent with prior UI work; its "reuse a path" note is intentional. ✓
- **Risk flagged:** the ironclad/cannon tests note the `requiresResource` interaction (test musketman/frigate for clean obsolescence); the eras accessor (`ctx.rules.eras`) is flagged to verify. ✓
