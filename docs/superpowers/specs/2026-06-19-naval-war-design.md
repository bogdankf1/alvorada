# Naval War + Coastal Reliability Design (Track C, Spec B2 of 2)

**Status:** Approved (2026-06-19)
**Predecessor:** `2026-06-19-naval-ai-design.md` (Spec B — Naval AI "Presence & Expansion"). This spec adds the deferred cross-water *conquest* half plus the coastal-city reliability follow-up.

## Goal

Two things, both improving the naval game on island maps:
1. **Amphibious assault** — a new combat capability (for human *and* AI): an embarked melee unit may storm an adjacent shore (land tile or coastal city), disembarking onto it on capture. The AI uses it to wage cross-water war: ship an escorted army to an enemy coastal city, soften it with ship bombardment, then storm it.
2. **Coastal-city reliability** — make the AI value coastal settle sites, so it founds coastal cities and naval bootstrapping (ships/harbors/overseas colonization from Spec B) becomes reliable rather than firing on only ~half of seeds.

## Context

- **Combat resolution already disembarks on capture.** `resolveAttack`/`resolveCityMelee` (`src/engine/systems/combat.ts`) advance the attacker onto the target tile when it kills the defender / captures the city (`attacker.q/r = dest`). For an embarked attacker, that advance *is* the disembark. On a failed assault the attacker doesn't advance → stays embarked. So the rule needs **no execution change**.
- **The only block is validation.** `validate.ts` ATTACK: `if (isEmbarked(...)) return fail('embarked units cannot attack')` (line 109). The downstream checks already restrict things: a land-domain unit can't target water (line 111-114, so embarked units can't hit ships), ranged units can't melee-attack (line 116), civilians can't attack (line 115), target must be adjacent + at war.
- **Attack strength** (`attackStrength(ctx, unit, vs)`, combat.ts:31) = hp-scaled base + class bonus + promotion bonus. No state, so an embarked-penalty flag must be passed by the caller (the call sites at lines 126/158 have `state` to compute `isEmbarked`). `defenseStrength` already weakens embarked units to `settings.naval.embarkedDefense` (5).
- **The AI war loop:** `considerWar` (decide.ts) declares war on a rival whose nearest known city is within 18 hexes (hexDistance ignores water, so a sea-neighbor qualifies); `campaignOrders` masses an army at a staging city then marches via `moveAlong` (strict `findPath`) — which **fails across water**, so a sea-separated enemy is never actually assaulted. This is the gap amphibious war fills.
- **`knownGoodSpots`** (economy.ts:50-77) scores a settle site purely by radius-2 yields (+3 per resource); it never considers the shore, so the AI rarely founds coastal cities (~2/13 on islands — the documented root cause of Spec B's unreliable bootstrapping). `isCoastal(ctx, state, {q,r})` is available (imported in economy.ts since Spec B).
- **`seaPath`** (decide.ts, Spec B) already plans an embarked land unit's crossing (`findPath(..., { embark: true })`).

## Scope

In scope:
1. Amphibious assault validation rule + a data-driven amphibious attack penalty.
2. Coastal-site bonus in `knownGoodSpots`.
3. AI amphibious war: invade a sea-only enemy coastal city (assemble → embark + escort → bombard → storm).

Out of scope:
- **New units/buildings/content.** Reuses existing land melee units + Galley/Galleass/Frigate + the embark mechanic.
- **Ranged amphibious / embarked bombardment.** Embarked units still can't make ranged attacks or fight ships — only melee-storm the shore.
- **Carrier/air, naval blockade-of-trade, multi-wave coordinated invasions.** The AI mounts a single escorted invasion at a time; fancier doctrine is future work.

## Design

### 1. Amphibious assault rule (engine)

**Validation** (`src/engine/validate.ts`, ATTACK case): replace the blanket embarked block with a narrower one that permits embarked **melee** units to strike **land** targets:
```ts
if (isEmbarked(ctx, state, unit) && (def.ranged || def.strength <= 0))
  return fail('only embarked soldiers can storm the shore');
```
(Embarked ranged/civilian still can't attack. Water targets remain blocked by the existing land-domain check at lines 111-114, so embarked units still can't fight ships. Adjacency + at-war checks already apply.)

**Execution** (`src/engine/systems/combat.ts`): no change to the advance/capture/disembark flow.

**Balance — amphibious attack penalty:** add `amphibiousAttackPct: -33` to `settings.naval` (`src/data/standard/index.ts`). Thread an `amphibious` flag through `attackStrength`:
```ts
export function attackStrength(ctx: Ctx, unit: Unit, vs: { unit?: Unit; city?: boolean; amphibious?: boolean }): number {
  const def = ctx.rules.units[unit.def];
  let s = hpScaled(def.strength, unit.hp) + classBonus(ctx, unit, vs) + promotionBonus(ctx, unit, 'attack', vs, def.strength);
  if (vs.amphibious) s += Math.floor((def.strength * ctx.rules.settings.naval.amphibiousAttackPct) / 100); // negative
  return s;
}
```
At the two call sites in `resolveAttack` (line 126) and `resolveCityMelee` (line 158), compute and pass it:
```ts
const amphibious = isEmbarked(ctx, state, attacker);
// resolveAttack:    attackStrength(ctx, attacker, { unit: defender, amphibious })
// resolveCityMelee: attackStrength(ctx, attacker, { city: true, amphibious })
```
(`isEmbarked` is already imported in combat.ts. The penalty applies to both human and AI amphibious attacks.)

### 2. Coastal-city reliability (AI)

In `knownGoodSpots` (`src/ai/economy.ts`), after the radius-2 yield scoring and before the `score >= 18` threshold, add a coastal bonus:
```ts
if (isCoastal(ctx, state, a)) score += COASTAL_BONUS; // a coastal site can build ships/harbors
```
with `COASTAL_BONUS` ≈ **6** (tunable; roughly one good worked tile's worth — enough to tip site selection toward the coast without overriding strong inland sites). This raises coastal sites in the ranking and pushes marginal coastal sites over the threshold, so the AI founds coastal cities → reliable naval bootstrapping. AI-only; no engine change.

### 3. Amphibious war AI (`src/ai/decide.ts`)

Extend the war AI so a **sea-only enemy coastal city** (one with no land route from our territory, reachable via `seaPath`) becomes a real campaign target. The orchestration, reusing Spec B's escort/bombard pieces and the new assault rule:

- **Target selection:** in the campaign logic, when the nearest known enemy city has no strict land path but is `isCoastal` and `seaPath`-reachable, treat it as a sea-invasion target.
- **Muster:** gather a melee strike force + at least one warship escort at the **staging coastal city** nearest the target (reuse the existing `campaignOrders` gathering/strength-vs-`cityStrength` gate, extended to also require an escort and an embark tech).
- **Embark & cross:** melee units of the strike force embark and sail toward the target via `seaPath`; the escort warships move with them (the Spec B escort behavior already screens embarked civilians — extend it to screen embarked military too).
- **Soften:** ranged ships (Galleass/Frigate) bombard the target city (Spec B's `navalFight`/coastal-raid already does this) to drop its hp before the assault.
- **Storm:** when an embarked melee unit is adjacent to the target coastal city and the city is sufficiently softened (or the force is strong enough vs `cityStrength` accounting for the −33% amphibious penalty), it issues `ATTACK` on the city → captures + disembarks via the new rule.

Need-gated like all naval AI: only mounts an invasion when at war with a sea-only rival and the mustered force clears the strength gate. A land-reachable enemy is still handled by the existing land `campaignOrders` unchanged.

### 4. Determinism

Changes AI behavior (coastal valuing + invasion orchestration) **and** combat (the amphibious rule + penalty), so **expect a self-play re-tune** (re-seed the science seed 314 and/or culture seed 960 if they flip; record the reason, never weaken the assertions). Mitigations:
- The amphibious rule is dormant where no unit is embarked-adjacent-to-shore — i.e. essentially all continents play (land units rarely embark there), so the *rule itself* barely touches continents.
- Coastal valuing and invasion AI are need-gated; the main continents shift is the coastal-site preference in `knownGoodSpots`.
- All new logic is a pure function of state + fog; replay/`gameHash` must stay bit-identical.

The full self-play suite is the gate.

### 5. Testing

New `tests/naval-war.test.ts`:
1. **Amphibious assault validates:** an embarked melee unit adjacent to an enemy coastal city can `ATTACK` it (`validateAction` ok); an embarked unit attacking a water tile / an enemy ship fails; an embarked *ranged* unit still can't `ATTACK`.
2. **Capture disembarks:** drive a melee unit embarked beside a 1-hp enemy coastal city (or weaken via repeated assault), `ATTACK`, and assert the city's owner flips to the attacker and the attacker is now on the city tile (on land, no longer embarked).
3. **Amphibious penalty:** `attackStrength(..., { city: true, amphibious: true })` is lower than `{ city: true }` by ⌊strength × 33/100⌋.
4. **Coastal bonus:** `knownGoodSpots` ranks/includes a coastal site it would otherwise rank below/exclude (build a fixture where a coastal site and a marginally-better inland site exist; assert the coastal one is preferred after the bonus).
5. **Invasion decision (seam):** given an embarked melee unit beside a softened enemy coastal city at war, the AI issues `ATTACK` on it (a `decideMilitaryForTest`-style assertion).

Plus:
- **Island behavioral test** (`tests/islands-mapgen.test.ts` or naval-war): over a long island game, an AI **captures a rival's city across water** (city owner changes to a player whose capital is on a different landmass). Emergent/seed-dependent — lock a demonstrating seed and comment it honestly. The Spec B overseas-colonization test should also be re-pointed to confirm coastal valuing keeps it reliable (or its seed re-locked).
- **Full self-play suite** green; re-seed 314/960 if shifted (documented).

## File-touch summary

- `src/engine/validate.ts` — narrow the embarked-attack block to permit melee-vs-shore.
- `src/engine/systems/combat.ts` — `attackStrength` gains `amphibious?` (penalty); the two call sites pass `isEmbarked(...)`.
- `src/data/standard/index.ts` — `settings.naval.amphibiousAttackPct: -33`.
- `src/ai/economy.ts` — coastal bonus in `knownGoodSpots`.
- `src/ai/decide.ts` — sea-invasion campaign orchestration (target/muster/embark+escort/bombard/storm).
- `tests/naval-war.test.ts` — new unit tests.
- `tests/islands-mapgen.test.ts` — island invasion behavioral test; verify/relock the colonization seed.
- `tests/selfplay.test.ts` — re-seed 314/960 only if the gate shows they flipped.

## No schema change

All changes are combat rules, a settings value, and AI logic. No new state; no `SCHEMA_VERSION` bump.
