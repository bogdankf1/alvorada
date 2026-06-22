# Batch 3 Content — Lumber Mill + Unit Obsolescence Design

**Status:** Approved (2026-06-22)
**Source:** Batch 3 playtest feedback items #1 and #2 (`docs/2026-06-17-testing-feedback.md`). The UI/QoL items (#3–7) shipped as Wave 3; these two are content (data + AI), bundled as one spec with two independent parts and a single re-tune gate.

## Goal

1. **Lumber Mill** — let a worker build a production improvement on an *un-cleared* forest (you keep the trees instead of chopping them). Needs a new "requires this feature" capability on improvements.
2. **Unit Obsolescence** — once a successor tech is researched, the superseded unit is no longer buildable (e.g. no archers once you have Machinery/crossbowmen). Existing units are unaffected.

## Determinism headline

Both touch the AI, so **expect a self-play re-tune** — mostly from the Lumber Mill (the AI's `bestWorkerJob` will build it on forests, shifting economies). Obsolescence barely changes AI behavior (`bestMilitary` already builds the strongest available, so it rarely built obsolete units). The full self-play suite is the gate; **re-seed 314 (science) / 960 (culture) if they flip** (documented, assertions never weakened). **No schema bump** — both are ruleset data + validation/`canProduce` gates; no new state.

## Part A — Lumber Mill

### Data
- **`ImprovementDef.requiresFeature?: string`** (new field, `src/data/types.ts`). An improvement with it builds only on a tile that *has* that feature, and does **not** clear it (the opposite of `clearsFeature`).
- **`lumber_mill` improvement** (`src/data/standard/resources.ts` IMPROVEMENTS):
  ```ts
  lumber_mill: { id: 'lumber_mill', name: 'Lumber Mill', turns: 4, yields: { production: 2 },
                 requiresFeature: 'forest', requiresTech: 'construction' },
  ```
  The forest stays (keeping its own +1 production and +3 defense), so a lumber-milled forest tile = terrain + forest 1 + mill 2. You trade the chop's one-time yield for permanent output.

### Engine
- **`BUILD_IMPROVEMENT` validation** (`src/engine/validate.ts`): insert a `requiresFeature` branch right after the `clearsFeature` branch (before the `if (tile.feature) return fail('the land must be cleared first')` line):
  ```ts
      if (imp.requiresFeature) {
        if (tile.feature !== imp.requiresFeature) return fail(`needs ${ctx.rules.features[imp.requiresFeature].name}`);
        if (tile.improvement === imp.id) return fail('already improved');
        return ok;
      }
  ```
  This lets the mill build on a forest while the existing "must be cleared first" rule still blocks normal improvements (farm/mine) on a feature tile.
- **Completion:** no reducer change — `turn.ts` only clears the feature when `clearsFeature` is set, so the forest survives a lumber-mill build.

### UI
- A `paintImprovement` case for `lumber_mill` (`src/ui/map/art.ts`) — a small saw/log motif drawn over the forest, in the style of the other painters.

### AI
- `bestWorkerJob` already enumerates improvements via real validation, so it will build the lumber mill on owned forest tiles once `construction` is researched — no AI code change needed (this is the main re-tune driver).

## Part B — Unit Obsolescence

### Data
- **`UnitDef.obsoletedBy?: string`** (new field, `src/data/types.ts`) — a tech id. Once the player holds that tech, the unit can no longer be built.
- **Catalog** (`src/data/standard/units.ts`), each obsoleted by the tech that unlocks its successor:

  | unit | `obsoletedBy` | superseded by |
  |---|---|---|
  | warrior | `iron_working` | swordsman |
  | spearman | `feudalism` | pikeman |
  | archer | `machinery` | crossbowman |
  | horseman | `chivalry` | knight |
  | swordsman | `gunpowder` | musketman |
  | catapult | `machinery` | trebuchet |
  | pikeman | `gunpowder` | musketman |
  | knight | `metallurgy` | cuirassier |
  | trebuchet | `metallurgy` | cannon |
  | galleass | `metallurgy` | frigate |

  Civ uniques inherit their base unit's gate: `legion` → `gunpowder`, `war_chariot` → `chivalry`, `bowman` → `machinery`, `hoplite` → `feudalism`. Latest-tier units (musketman, crossbowman, cannon, cuirassier, frigate, galley, scout, settler, worker, work_boat, caravan) get **no** `obsoletedBy`.

### Engine
- **`canProduce`** unit branch (`src/engine/selectors.ts`): after the `requiresTech` check, add:
  ```ts
      if (def.obsoletedBy && player.techs.includes(def.obsoletedBy))
        return { ok: false, reason: 'obsolete' };
  ```
  Because `productionOptions` filters by `canProduce`, an obsolete unit simply **vanishes** from the build menu (Civ-style). It does **not** appear in the Wave 3 "Unavailable" list either (`cityBuildHints` only surfaces coastal/resource gates). **Existing units are unaffected** — obsolescence only blocks *building new ones*.

### AI
- `pickProduction`/`bestMilitary` already gate on `canProduce`, so the AI automatically stops building obsolete units. No AI code change.

## Testing

New `tests/batch3-content.test.ts`:

**Lumber Mill:**
1. A worker on an owned **forest** tile can build `lumber_mill` (`validateAction` ok, after `construction`); on a non-forest tile it fails (`needs Forest`).
2. After building, `tile.improvement === 'lumber_mill'` **and** `tile.feature === 'forest'` (the forest survived), and `tileYields` production rose by 2.
3. A normal improvement (e.g. `farm`) still cannot be built on a forest tile ("must be cleared first") — the requiresFeature branch didn't loosen that.

**Obsolescence:**
4. `canProduce(archer)` is ok before `machinery`; after pushing `machinery`, it fails with reason `obsolete`; `productionOptions` no longer lists `archer`.
5. A latest-tier unit (e.g. `crossbowman`) is unaffected by any tech.
6. (Optional) a civ-unique inherits its gate: Babylon's `bowman` is obsolete once `machinery` is held.

**Gate:**
- Full `npm test` green; **`npm run build` (tsc) too** (the Spec B2 lesson). Re-seed 314/960 only if they flip — record the reason in `selfplay.test.ts` (matching the existing history), never weaken the assertions.

## File-touch summary

- `src/data/types.ts` — `ImprovementDef.requiresFeature`, `UnitDef.obsoletedBy`.
- `src/data/standard/resources.ts` — `lumber_mill` improvement.
- `src/data/standard/units.ts` — `obsoletedBy` on the catalog units + uniques.
- `src/engine/validate.ts` — `requiresFeature` branch in `BUILD_IMPROVEMENT`.
- `src/engine/selectors.ts` — `obsoletedBy` gate in `canProduce`.
- `src/ui/map/art.ts` — `lumber_mill` paint case.
- `tests/batch3-content.test.ts` — new tests.
- `tests/selfplay.test.ts` — re-seed 314/960 only if the gate shows they flipped.

## No schema change

Both are ruleset data + a validation branch + a `canProduce` gate. No new `GameState` fields; no `SCHEMA_VERSION` bump.
