# Islands Map-Gen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `mapType: 'islands'` generator — a few large landmasses (≈2 civs each) plus scattered neutral islets — leaving the existing continents generator byte-identical.

**Architecture:** `generateMap` gains a top-level branch on `config.mapType`. The existing body becomes the untouched `'continents'` path; a new `generateIslandsMap` reuses the shared climate/resource/fairness passes (extracted in a guarded refactor) but swaps in a multi-center land mask, a deep-ocean islet pass, and a distribute-starts-across-continents placement. A MainMenu toggle threads the choice through `GameConfig`.

**Tech Stack:** TypeScript, Vitest. Deterministic seeded map-gen (`makeRng`/`hash2`/`fbm`), the same reducer/self-play determinism gate as every other slice.

**Spec:** `docs/superpowers/specs/2026-06-18-islands-map-gen-design.md`

---

## File Structure

- `src/engine/types.ts` — add `GameConfig.mapType?: 'continents' | 'islands'`.
- `src/engine/map/generate.ts` — top-level dispatch; extracted shared helpers; `generateIslandsMap` + `tryGenerateIslands` + `placeStartsIslands`.
- `src/ui/MainMenu.tsx` — Continents/Islands toggle threaded into the config.
- `tests/islands-mapgen.test.ts` — new test file (regression guard, islands determinism/distribution/islets, smoke self-play).

**Task order:** Task 1 pins continents output (the refactor's safety net). Task 2 does the no-op refactor under that net. Task 3 adds the config field + dispatch + the islands land-mask/islets (with a temporary single-continent start placement). Task 4 swaps in distributed start placement. Task 5 is the UI toggle. Task 6 is the smoke self-play + full-suite gate.

---

## Task 1: Continents-output regression guard

Pin the current continents output so the Task 2 refactor can be proven byte-identical without running the full 5-minute suite.

**Files:**
- Modify: `src/engine/types.ts`
- Test: `tests/islands-mapgen.test.ts` (create)

- [ ] **Step 0: Add the (inert, optional) `mapType` field first**

In `src/engine/types.ts`, add to `interface GameConfig` (after `players`):
```ts
  mapType?: 'continents' | 'islands';
```
This is optional and unused by the continents path (`generateMap` doesn't branch on it until Task 3), so it changes no behavior — it just lets the test files below reference `mapType` and compile cleanly.

- [ ] **Step 1: Write the guard test (create the file)**

Create `tests/islands-mapgen.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { generateMap } from '../src/engine/map/generate';
import type { GameConfig, GeneratedMap } from '../src/engine/map/generate';
import type { PlayerSpec } from '../src/engine/types';

const FOUR: PlayerSpec[] = [
  { civ: 'rome', controller: 'ai' },
  { civ: 'egypt', controller: 'ai' },
  { civ: 'babylon', controller: 'ai' },
  { civ: 'hellas', controller: 'ai' },
];
const cfg = (seed: number, mapType?: 'continents' | 'islands'): GameConfig =>
  ({ seed, mapW: 46, mapH: 28, players: FOUR, mapType });

/** FNV-1a-ish fingerprint of a generated map's content + starts. */
function fingerprint(m: GeneratedMap): string {
  let h = 2166136261 >>> 0;
  const push = (s: string) => {
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  };
  for (const t of m.tiles) push(t.terrain + t.elevation + (t.feature ?? '') + (t.resource ?? ''));
  for (const s of m.starts) push(`@${s.q},${s.r}`);
  return (h >>> 0).toString(16);
}

describe('continents output (regression guard)', () => {
  it('is unchanged for fixed seeds', () => {
    expect(fingerprint(generateMap(cfg(12345), STANDARD_RULESET))).toBe('REPLACE_ME_1');
    expect(fingerprint(generateMap(cfg(67890), STANDARD_RULESET))).toBe('REPLACE_ME_2');
  });
});
```
Note: `GeneratedMap` is already exported from `generate.ts`, and `GameConfig.mapType` exists as of Step 0, so the `cfg` helper compiles.

- [ ] **Step 2: Capture the real fingerprints**

Run: `npx vitest run tests/islands-mapgen.test.ts`
It will FAIL and print the actual values. Replace `REPLACE_ME_1` / `REPLACE_ME_2` with the printed `expected` strings.

- [ ] **Step 3: Re-run to confirm it passes**

Run: `npx vitest run tests/islands-mapgen.test.ts`
Expected: PASS (this is now the pre-refactor baseline).

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts tests/islands-mapgen.test.ts
git commit -m "test(mapgen): add mapType field + pin continents output as a regression guard"
```

---

## Task 2: Refactor shared passes (no-op, guarded)

Extract the climate/resource/fairness passes so `generateIslandsMap` can reuse them. The continents output must not change.

**Files:**
- Modify: `src/engine/map/generate.ts`

- [ ] **Step 1: Extract three module-level helpers**

In `src/engine/map/generate.ts`, factor these out of `tryGenerate` into module-scope functions (cut the existing code; do not rewrite its logic):

```ts
/** Step 3: climate -> base terrain + hills/mountains + features. Mutates `tiles`. */
function paintClimate(
  tiles: Tile[], W: number, H: number, n: number,
  elevation: number[], land: boolean[], px: number[], py: number[], seed: number,
): void {
  const landElevSorted = elevation.filter((_, i) => land[i]).sort((a, b) => a - b);
  const hillLevel = landElevSorted[Math.floor(landElevSorted.length * HILL_PCT)] ?? Infinity;
  const mountainLevel = landElevSorted[Math.floor(landElevSorted.length * MOUNTAIN_PCT)] ?? Infinity;
  for (let i = 0; i < n; i++) {
    const a = axialOfIndex(i, W);
    if (!land[i]) { tiles[i] = blank('ocean'); continue; }
    const lat = Math.abs(a.r - (H - 1) / 2) / ((H - 1) / 2);
    const temp = 1 - lat + (fbm(px[i] * 0.08, py[i] * 0.08, seed + 31) - 0.5) * 0.28;
    const moist = fbm(px[i] * 0.07, py[i] * 0.07, seed + 67);
    let terrain: string;
    if (temp < 0.14) terrain = 'snow';
    else if (temp < 0.32) terrain = 'tundra';
    else if (temp > 0.72 && moist < 0.42) terrain = 'desert';
    else if (moist < 0.45) terrain = 'plains';
    else terrain = 'grassland';
    const t = blank(terrain);
    if (elevation[i] > mountainLevel) t.elevation = 'mountain';
    else if (elevation[i] > hillLevel) t.elevation = 'hill';
    if (t.elevation !== 'mountain') {
      const forestNoise = fbm(px[i] * 0.09, py[i] * 0.09, seed + 131);
      if (temp > 0.74 && moist > 0.58 && (terrain === 'grassland' || terrain === 'plains')) {
        t.feature = 'jungle';
      } else if (forestNoise > 0.56 && moist > 0.42 && temp > 0.2 && temp < 0.8 &&
        (terrain === 'grassland' || terrain === 'plains' || terrain === 'tundra')) {
        t.feature = 'forest';
      } else if (terrain === 'desert' && t.elevation === 'flat' && hash2(i, 9, seed) < 0.05) {
        t.feature = 'oasis';
      }
    }
    tiles[i] = t;
  }
  // coast pass
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const isCoast = neighbors(axialOfIndex(i, W)).some((nb) => {
      const j = tileIndex(nb, W, H);
      return j >= 0 && land[j];
    });
    if (isCoast) tiles[i].terrain = 'coast';
  }
}

/** Step 5: weighted resources. Mutates `tiles`, draws from `rng`. */
function placeResources(tiles: Tile[], n: number, rng: Rng, rules: Ruleset): void {
  const resourceDefs = Object.values(rules.resources).sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (t.elevation === 'mountain' || t.feature === 'oasis') continue;
    if (rng.next() >= RESOURCE_CHANCE) continue;
    const candidates = resourceDefs.filter(
      (r) => r.spawn.terrains.includes(t.terrain) &&
        (!r.spawn.elevations || r.spawn.elevations.includes(t.elevation)),
    );
    if (!candidates.length) continue;
    const totalWeight = candidates.reduce((s, r) => s + r.spawn.weight, 0);
    let roll = rng.next() * totalWeight;
    for (const r of candidates) {
      roll -= r.spawn.weight;
      if (roll <= 0) { t.resource = r.id; break; }
    }
  }
}

/** Step 7: strategic-resource fairness near every start. Mutates `tiles`. */
function fairnessPass(tiles: Tile[], W: number, H: number, starts: Axial[], rules: Ruleset): void {
  const resourceDefs = Object.values(rules.resources).sort((a, b) => a.id.localeCompare(b.id));
  for (const start of starts) {
    for (const res of resourceDefs) {
      if (res.kind !== 'strategic') continue;
      ensureResourceNear(tiles, W, H, start, res.id, 2, 4, rules);
    }
  }
}
```
Add a `Rng` import: `import { makeRng, hash2, type Rng } from '../rng';` (it already imports `makeRng, hash2`; add `type Rng`). Add `Tile`/`Axial`/`Ruleset` to existing type imports if not already present (they are).

- [ ] **Step 2: Call the helpers from `tryGenerate`**

Replace the inlined step-3, step-5, step-7 blocks in `tryGenerate` with:
```ts
  // --- 3. climate -> terrain (+ hills/mountains, features, coast) ---
  const tiles: Tile[] = new Array(n);
  paintClimate(tiles, W, H, n, elevation, land, px, py, seed);

  // --- 5. resources ---
  placeResources(tiles, n, rng, rules);

  // --- 6. starts on the main continent ---
  const starts = placeStarts(tiles, W, H, component, mainContinent, playerCount, rules);
  if (!starts) return null;

  // --- 7. fairness ---
  fairnessPass(tiles, W, H, starts, rules);

  return { tiles, starts };
```
Keep steps 1 (elevation/land mask), 2 (components/mainContinent), and 4 (coast — now inside `paintClimate`; remove the old standalone coast block) consistent. The net behavior must be identical.

- [ ] **Step 3: Run the regression guard**

Run: `npx vitest run tests/islands-mapgen.test.ts`
Expected: PASS — fingerprints unchanged (proves the refactor is a no-op).

- [ ] **Step 4: Run the broader map/engine tests**

Run: `npx vitest run tests/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/map/generate.ts
git commit -m "refactor(mapgen): extract climate/resource/fairness passes (no-op)"
```

---

## Task 3: Config field + dispatch + islands land mask & islets

Add `mapType`, branch `generateMap`, and implement the islands generator's land mask + islets. Use a **temporary** single-largest-component start placement so it returns a valid map (Task 4 makes starts distributed).

**Files:**
- Modify: `src/engine/map/generate.ts`
- Test: `tests/islands-mapgen.test.ts`

(`GameConfig.mapType` was already added in Task 1 Step 0.)

- [ ] **Step 1: Write failing tests**

Append to `tests/islands-mapgen.test.ts`:
```ts
/** Label connected land components; return per-tile component id (-1 for ocean) + sizes. */
function label(m: GeneratedMap, W: number, H: number) {
  const comp = new Array(m.tiles.length).fill(-1);
  const sizes: number[] = [];
  const isLand = (i: number) => m.tiles[i].terrain !== 'ocean' && m.tiles[i].terrain !== 'coast';
  for (let i = 0; i < m.tiles.length; i++) {
    if (!isLand(i) || comp[i] !== -1) continue;
    let size = 0; const q = [i]; comp[i] = sizes.length;
    while (q.length) {
      const cur = q.pop()!; size++;
      const a = { q: cur % W, r: Math.floor(cur / W) };
      for (const nb of [ {q:a.q+1,r:a.r},{q:a.q-1,r:a.r},{q:a.q,r:a.r+1},{q:a.q,r:a.r-1},{q:a.q+1,r:a.r-1},{q:a.q-1,r:a.r+1} ]) {
        if (nb.q < 0 || nb.q >= W || nb.r < 0 || nb.r >= H) continue;
        const j = nb.r * W + nb.q;
        if (isLand(j) && comp[j] === -1) { comp[j] = comp[cur]; q.push(j); }
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

describe('islands map-gen', () => {
  it('is deterministic for a fixed seed', () => {
    const a = generateMap(cfg(2024, 'islands'), STANDARD_RULESET);
    const b = generateMap(cfg(2024, 'islands'), STANDARD_RULESET);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.starts).toEqual(b.starts);
  });

  it('produces at least K=2 sizable landmasses', () => {
    const m = generateMap(cfg(2024, 'islands'), STANDARD_RULESET);
    const { sizes } = label(m, 46, 28);
    const sizable = sizes.filter((s) => s >= 6).sort((x, y) => y - x);
    expect(sizable.length).toBeGreaterThanOrEqual(2);
  });

  it('scatters at least one small islet (a tiny land component)', () => {
    const m = generateMap(cfg(2024, 'islands'), STANDARD_RULESET);
    const { sizes } = label(m, 46, 28);
    expect(sizes.some((s) => s >= 1 && s <= 6)).toBe(true);
  });
});
```
(If seed 2024 happens not to scatter an islet, pick another fixed seed that does and use it consistently — islets are common but probabilistic per seed.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/islands-mapgen.test.ts -t "islands map-gen"`
Expected: FAIL — `generateMap` ignores `mapType` (continents output: one big landmass, the K≥2 / islet assertions fail).

- [ ] **Step 3: Branch `generateMap` and add the islands generator**

In `src/engine/map/generate.ts`, change the top of `generateMap`:
```ts
export function generateMap(config: GameConfig, rules: Ruleset): GeneratedMap {
  if (config.mapType === 'islands') return generateIslandsMap(config, rules);
  const { mapW: W, mapH: H, seed } = config;
  // ...existing continents body unchanged...
}
```
Add module-level constants near the existing ones:
```ts
const LAND_FRACTION_ISLANDS = 0.32;
const FALLOFF_INNER = 0.28;
const FALLOFF_STRENGTH = 1.6;
const ISLET_BAND = 0.55;
const ISLET_THRESHOLD = 0.985;
```
Add the generator + its `tryGenerateIslands` (mirrors `generateMap`/`tryGenerate`'s retry shape):
```ts
function generateIslandsMap(config: GameConfig, rules: Ruleset): GeneratedMap {
  const { mapW: W, mapH: H, seed } = config;
  const n = W * H;
  const playerCount = config.players.length;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rng = makeRng((seed ^ (attempt * 0x9e3779b9)) | 0);
    const result = tryGenerateIslands(W, H, n, seed + attempt * 7919, rng, rules, playerCount);
    if (result) return result;
  }
  throw new Error('island map generation failed: could not place starts');
}

function tryGenerateIslands(
  W: number, H: number, n: number, seed: number, rng: Rng, rules: Ruleset, playerCount: number,
): GeneratedMap | null {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const K = Math.max(2, Math.round(playerCount / 2));

  // --- continent centers on a jittered interior grid (pixel space) ---
  const maxPix = hexToPixel({ q: W, r: H }, 1);
  const cols = Math.ceil(Math.sqrt(K));
  const rows = Math.ceil(K / cols);
  const centers: { x: number; y: number }[] = [];
  for (let k = 0; k < K; k++) {
    const gx = k % cols, gy = Math.floor(k / cols);
    const nx = clamp((gx + 0.5 + (hash2(k, 1, seed) - 0.5) * 0.7) / cols, 0.18, 0.82);
    const ny = clamp((gy + 0.5 + (hash2(k, 2, seed) - 0.5) * 0.7) / rows, 0.18, 0.82);
    centers.push({ x: nx * maxPix.x, y: ny * maxPix.y });
  }

  // --- 1. multi-center elevation -> land mask ---
  const elevation = new Array<number>(n);
  const px = new Array<number>(n);
  const py = new Array<number>(n);
  const dNear = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = axialOfIndex(i, W);
    const p = hexToPixel(a, 1);
    px[i] = p.x; py[i] = p.y;
    let dn = Infinity;
    for (const c of centers) {
      const cx = (p.x - c.x) / maxPix.x;
      const cy = (p.y - c.y) / maxPix.y;
      const d = Math.sqrt(cx * cx * 1.15 + cy * cy * 1.35);
      if (d < dn) dn = d;
    }
    dNear[i] = dn;
    const falloff = Math.max(0, dn - FALLOFF_INNER) * FALLOFF_STRENGTH;
    elevation[i] = fbm(p.x * NOISE_SCALE, p.y * NOISE_SCALE, seed) - falloff;
  }
  const sorted = [...elevation].sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(n * (1 - LAND_FRACTION_ISLANDS))];
  const land = elevation.map((e, i) => {
    const a = axialOfIndex(i, W);
    const col = i % W;
    if (col === 0 || col === W - 1 || a.r === 0 || a.r === H - 1) return false; // ocean rim
    return e > seaLevel;
  });

  // --- scattered islets in deep ocean (stateless; doesn't touch rng) ---
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const a = axialOfIndex(i, W);
    const col = i % W;
    if (col === 0 || col === W - 1 || a.r === 0 || a.r === H - 1) continue;
    if (dNear[i] > ISLET_BAND && hash2(i, 17, seed) > ISLET_THRESHOLD) land[i] = true;
  }

  // --- 2. components ---
  const component = new Array<number>(n).fill(-1);
  let componentCount = 0;
  const componentSizes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!land[i] || component[i] !== -1) continue;
    let size = 0;
    const queue = [i];
    component[i] = componentCount;
    while (queue.length) {
      const cur = queue.pop()!;
      size++;
      for (const nb of neighbors(axialOfIndex(cur, W))) {
        const j = tileIndex(nb, W, H);
        if (j >= 0 && land[j] && component[j] === -1) { component[j] = componentCount; queue.push(j); }
      }
    }
    componentSizes.push(size);
    componentCount++;
  }
  if (componentSizes.length === 0) return null;

  // --- 3-5. climate + resources (shared passes) ---
  const tiles: Tile[] = new Array(n);
  paintClimate(tiles, W, H, n, elevation, land, px, py, seed);
  placeResources(tiles, n, rng, rules);

  // --- 6. distributed starts (TEMPORARY: largest component only; Task 4 distributes) ---
  const mainContinent = componentSizes.indexOf(Math.max(...componentSizes));
  const starts = placeStarts(tiles, W, H, component, mainContinent, playerCount, rules);
  if (!starts) return null;

  // --- 7. fairness ---
  fairnessPass(tiles, W, H, starts, rules);
  return { tiles, starts };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/islands-mapgen.test.ts`
Expected: PASS (regression guard still green + the three islands tests). If the K≥2 or islet test fails for seed 2024, try a couple of nearby fixed seeds and lock the one that satisfies both (then use it in every islands test for consistency).

- [ ] **Step 5: Commit**

```bash
git add src/engine/map/generate.ts tests/islands-mapgen.test.ts
git commit -m "feat(mapgen): islands map type — multi-center land mask + islets"
```

---

## Task 4: Distributed start placement

Replace the temporary largest-component placement with starts distributed ≈2 civs per continent across the K largest landmasses.

**Files:**
- Modify: `src/engine/map/generate.ts`
- Test: `tests/islands-mapgen.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/islands-mapgen.test.ts` (inside or after the `islands map-gen` describe):
```ts
describe('islands start distribution', () => {
  it('spreads the 4 starts across >= 2 landmasses, none on a tiny islet', () => {
    const m = generateMap(cfg(2024, 'islands'), STANDARD_RULESET);
    const { comp, sizes } = label(m, 46, 28);
    const startComps = m.starts.map((s) => comp[s.r * 46 + s.q]);
    expect(new Set(startComps).size).toBeGreaterThanOrEqual(2);          // distributed
    for (const c of startComps) expect(sizes[c]).toBeGreaterThanOrEqual(6); // a continent, not an islet
    expect(m.starts.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/islands-mapgen.test.ts -t "start distribution"`
Expected: FAIL — the temporary placement puts all 4 starts on one component (`new Set(startComps).size === 1`).

- [ ] **Step 3: Add `placeStartsIslands`**

In `src/engine/map/generate.ts`, add:
```ts
function placeStartsIslands(
  tiles: Tile[], W: number, H: number,
  component: number[], componentSizes: number[], playerCount: number, rules: Ruleset,
): Axial[] | null {
  const K = Math.max(2, Math.round(playerCount / 2));
  const ranked = componentSizes
    .map((size, id) => ({ id, size }))
    .sort((a, b) => b.size - a.size || a.id - b.id);
  if (ranked.length < K) return null;
  const continents = ranked.slice(0, K);
  // even quota across continents, largest-first (continents already sorted desc)
  const quotas = new Array(K).fill(0);
  for (let i = 0; i < playerCount; i++) quotas[i % K]++;
  for (let c = 0; c < K; c++) if (continents[c].size < 3 * quotas[c]) return null;

  const chosen: Axial[] = [];
  for (let c = 0; c < K; c++) {
    const comp = continents[c].id;
    const quota = quotas[c];
    const cands: { a: Axial; score: number; i: number }[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (component[i] !== comp) continue;
      const t = tiles[i];
      if (t.elevation === 'mountain' || t.terrain === 'snow' || t.terrain === 'desert') continue;
      const a = axialOfIndex(i, W);
      const col = i % W;
      if (col < 2 || col > W - 3 || a.r < 2 || a.r > H - 3) continue;
      cands.push({ a, score: startScore(tiles, W, H, a, rules), i });
    }
    if (cands.length < quota) return null;
    cands.sort((x, y) => y.score - x.score || x.i - y.i);
    let placed: Axial[] | null = null;
    for (let minDist = Math.max(6, Math.floor((W + H) / 8)); minDist >= 3; minDist--) {
      const pick: Axial[] = [];
      for (const cd of cands) {
        if (pick.every((s) => hexDistance(s, cd.a) >= minDist)) {
          pick.push(cd.a);
          if (pick.length === quota) break;
        }
      }
      if (pick.length === quota) { placed = pick; break; }
    }
    if (!placed) return null;
    chosen.push(...placed);
  }
  return chosen;
}
```

- [ ] **Step 4: Use it in `tryGenerateIslands`**

In `tryGenerateIslands`, replace the temporary step-6 block:
```ts
  // --- 6. distributed starts (TEMPORARY: largest component only; Task 4 distributes) ---
  const mainContinent = componentSizes.indexOf(Math.max(...componentSizes));
  const starts = placeStarts(tiles, W, H, component, mainContinent, playerCount, rules);
  if (!starts) return null;
```
with:
```ts
  // --- 6. distributed starts across the K largest continents ---
  const starts = placeStartsIslands(tiles, W, H, component, componentSizes, playerCount, rules);
  if (!starts) return null;
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/islands-mapgen.test.ts`
Expected: PASS (all: regression guard, islands land mask, islets, distribution). The islands-determinism test still holds (placement is deterministic).

- [ ] **Step 6: Commit**

```bash
git add src/engine/map/generate.ts tests/islands-mapgen.test.ts
git commit -m "feat(mapgen): distribute island starts across the largest continents"
```

---

## Task 5: MainMenu world-type toggle

Let a human pick Islands when starting a game.

**Files:**
- Modify: `src/ui/MainMenu.tsx`

- [ ] **Step 1: Add state + a toggle row**

In `src/ui/MainMenu.tsx`, add state near the other `useState` calls:
```ts
  const [mapType, setMapType] = useState<'continents' | 'islands'>('continents');
```
Inside the "The World" `menu-section` (after the size `menu-row`), add a second row mirroring the size-choice markup:
```tsx
          <div className="menu-row">
            {(['continents', 'islands'] as const).map((mt) => (
              <div
                key={mt}
                className={`choice ${mapType === mt ? 'is-active' : ''}`}
                onClick={() => setMapType(mt)}
              >
                {mt === 'continents' ? 'Continents' : 'Islands'}
                <small>{mt === 'continents' ? 'one landmass' : 'seas to cross'}</small>
              </div>
            ))}
          </div>
```

- [ ] **Step 2: Thread it into the config**

In the `begin` callback, add `mapType` to the `newGame` config:
```ts
      LocalGame.newGame({
        seed: Number.isFinite(seed) ? seed : randomSeed(),
        mapW: cfg.w,
        mapH: cfg.h,
        players,
        mapType,
      }),
```

- [ ] **Step 3: Build sanity**

Run: `npm run build`
Expected: success, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/MainMenu.tsx
git commit -m "feat(ui): Continents/Islands world-type toggle in the new-game menu"
```

---

## Task 6: Smoke self-play + full-suite gate

Prove an island game runs legally with the current land-only AI and that the continents default is untouched end-to-end.

**Files:**
- Test: `tests/islands-mapgen.test.ts`

- [ ] **Step 1: Add the smoke test**

Append to `tests/islands-mapgen.test.ts`:
```ts
import { initialState } from '../src/engine/state';
import { applyAction } from '../src/engine/reducer';
import { gameHash } from '../src/engine/serialize';
import { decide } from '../src/ai/decide';
import { ctx } from './helpers';

describe('islands self-play smoke', () => {
  it('a 4-player island game runs ~40 turns legally and replays bit-identically', () => {
    const config = cfg(2024, 'islands');
    const run = () => {
      let s = initialState(config, ctx);
      const log: any[] = [];
      while (s.phase === 'playing' && s.turn <= 40) {
        const pid = s.currentPlayer;
        for (let i = 0; ; i++) {
          expect(i, `turn ${s.turn} p${pid}: action cap`).toBeLessThan(400);
          const { action } = decide(ctx, s, pid);
          s = applyAction(ctx, s, action); // an illegal AI action throws -> fails the test
          log.push(action);
          if (action.type === 'END_TURN' || s.phase === 'ended') break;
        }
      }
      return { s, log };
    };
    const a = run();
    // every AI lived legally to the cap; sanity that the game progressed
    expect(a.s.turn).toBeGreaterThan(1);
    // replay the log bit-identically
    let replay = initialState(config, ctx);
    for (const act of a.log) replay = applyAction(ctx, replay, act);
    expect(gameHash(replay)).toBe(gameHash(a.s));
  }, 60_000);
});
```

- [ ] **Step 2: Run the islands test file**

Run: `npx vitest run tests/islands-mapgen.test.ts`
Expected: PASS (all islands tests + the smoke run). If the AI throws on an illegal action, that's a real bug to fix — most likely a settler/worker pathing assumption; investigate and report rather than masking.

- [ ] **Step 3: Full-suite determinism gate**

Run: `npm test`
Expected: ALL green. Critically, the continents self-play seeds are UNCHANGED — seed 314 (science) and seed 949 (culture) still pass, replays bit-identical. (The benign vitest `onTaskUpdate` IPC timeout artifact may print; it is not a failure — confirm the pass/fail counts.)

- [ ] **Step 4: If any continents seed flipped, STOP and investigate**

A flipped seed means the refactor (Task 2) altered continents output. Do not re-tune the seed — the refactor must be a true no-op. Re-check `paintClimate`/`placeResources`/`fairnessPass` against the original inlined code. Report rather than masking.

- [ ] **Step 5: Commit (only if Step 1 added the test; the suite run needs no code change)**

```bash
git add tests/islands-mapgen.test.ts
git commit -m "test(mapgen): islands self-play smoke + determinism gate"
```

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** config field + dispatch (Task 3), multi-center land mask + islets (Task 3), distributed starts (Task 4), shared-pass refactor (Task 2), MainMenu toggle (Task 5), continents-unchanged guard (Task 1 + Task 6 full suite), islands determinism/distribution/islet/smoke tests (Tasks 3/4/6). All spec sections covered. ✓
- **Determinism:** continents path is the same code behind a branch; the regression fingerprint (Task 1) + the full self-play suite (Task 6) are the dual guard. Islands randomness is all seed-derived (`makeRng`/`hash2`/`fbm`); islet + center passes use stateless `hash2` so the resource `rng` stream is unperturbed. No island victory-seed test (naval AI absent → score-timeout is the expected legal end). ✓
- **Type consistency:** `paintClimate`/`placeResources`/`fairnessPass` signatures are defined once (Task 2) and called identically in both `tryGenerate` (Task 2) and `tryGenerateIslands` (Task 3). `placeStartsIslands` returns `Axial[] | null` like `placeStarts`. `K = Math.max(2, Math.round(playerCount/2))` and the `3×quota` size floor appear identically in the generator and `placeStartsIslands`. `GeneratedMap`/`GameConfig` already exported from `generate.ts`/`types.ts`. ✓
- **Placeholder scan:** the only intentional placeholders are `REPLACE_ME_1/2` (Task 1 Step 2 captures them) and the documented "temporary largest-component placement" in Task 3 that Task 4 replaces — both are explicit, sequenced steps, not gaps. Every code step shows complete code. ✓
- **Seed caveat:** islet/landmass tests use a fixed seed (2024) that must satisfy "≥2 sizable landmasses + ≥1 islet"; the plan instructs locking a verified seed if 2024 doesn't (islets are probabilistic per seed). ✓
