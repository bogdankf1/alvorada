# Alvorada — "More Alive, Full, Contained, Civilization‑like" Audit & Roadmap

*2026‑06‑15. A whole‑game audit and a prioritized list of additions. Grounded in a
5‑dimension code audit (engine, content, AI, UX, deferred‑backlog) and design research
(Soren Johnson / Civ IV, Old World, Civ VI Rise & Fall).*

---

## 0. TL;DR

Alvorada is **a complete‑but‑compressed Ancient→Renaissance 4X** with an excellent,
genuinely extensible engine. The breadth of *systems* is already Civ‑like (religion,
civics, diplomacy, trade, promotions, happiness, barbarians, 4 victory paths). What's
missing is not more mechanics on the spreadsheet — it's **life**: the world doesn't *do*
anything on its own, every rival plays identically, nothing surprising happens between
turns, and the game can't *tell you the story of what just happened*.

**The single highest‑leverage move is not more content — it's a "Living World" layer**
(leader personalities, a deterministic event/chronicle system, surfaced rival
reactivity) plus a **"Legibility" layer** (civilopedia, tooltips, a victory‑progress
finish line, era ceremony). Both reuse infrastructure that already exists but lies
dormant (the in‑state RNG, the attitude model, the event‑routing pipe). They make the
*existing* depth *felt* — which is exactly "more alive, more contained" — without a
content treadmill or a structural rewrite.

The bigger, bounded "full / civ‑like" pillars come next (city‑states, goody huts +
natural wonders, great people, golden/dark ages). The team's own largest deferred track —
the **naval / map‑world half** (ships, embarkation, rivers) — is the one true XL bet and
is optional, because map‑gen currently guarantees same‑continent starts (the game is
"honest without boats").

---

## 1. Where Alvorada stands

### 1.1 Strengths to protect (do not "improve" these)

- **A clean deterministic engine.** `state' = reduce(state, action)`; all randomness via
  in‑state `mulberry32`; bit‑identical replay enforced by self‑play tests. This is the
  load‑bearing wall and the reason the game is extensible.
- **Data‑driven content.** Terrain, units, techs, buildings, resources, civs, policies,
  promotions, beliefs are pure data validated at startup. "Add a def, the game grows."
- **Explainable AI.** Every AI action carries a human‑readable `reason` surfaced in the
  Counsel of Rivals. Rare and valuable — keep it.
- **A real art direction.** The parchment fog *is* the fog of war; chamfered brass
  plates; seeded per‑tile jitter; era‑true iconography. The screenshots already read
  "a map being discovered."
- **Broad systems for the scope.** Religion, civics/policies, diplomacy w/ attitude,
  trade routes, empire happiness, promotions/XP, zone of control, barbarians, wonders,
  and four victory conditions are all shipped (schema v6, five completed tracks).

### 1.2 The shape of the content (verified counts)

| Category | Count | Notes |
|---|---|---|
| Eras | **4** | Ancient · Classical · Medieval · Renaissance. Game ends pre‑industrial. |
| Techs | **29** | 8 / 6 / 7 / 8 per era. Tall thin lattice; capstone `scientific_method`. |
| Units | **17** | **all `domain:'land'`** — 4 civilian, 5 melee, 2 ranged, 3 mounted, 3 siege. |
| Buildings | **26** | incl. **8 world wonders**; **no national wonders**. |
| Resources | **12** | 5 bonus · 2 strategic (horses/iron) · 5 luxury (4 are mechanically identical). |
| Improvements | 6 | farm/mine/pasture/quarry/plantation/clear. No roads. |
| Civs | **4** | Rome/Egypt/Babylon/Hellas — **zero unique ability / unit / building**. |
| Policies | 9 | 3 branches × 3. Beliefs ~15 (6 pantheon/4 founder/4 follower). Promotions ~11. |
| Victory paths | 4 | conquest · science · culture · score/time. |

For reference, a mainline Civ ships ~80+ techs across 6–9 eras, dozens of units incl. a
full naval line, 20+ wonders, ~40 differentiated civs, dozens of luxuries. Alvorada is
roughly **a third of a full Civ's content, deliberately scoped to one coherent slice.**

### 1.3 Systems present vs. absent

**Present (deep or solid):** city growth/starvation, 6 yields, specialists & citizen
assignment, empire happiness, culture border expansion, world wonders, trade routes
(caravans, domestic/intl, pillageable), strategic‑resource gating, religion (pantheon→
religion→pressure spread + beliefs), civics/policies, diplomacy (war/peace, attitude
model, denounce, decaying grudges, open borders, gold/gold‑per‑turn deals), combat
(1UPT, melee/ranged, city HP/walls/garrison, promotions/XP, healing, capture), soft
zone of control, barbarians (camps, escalating spawns, bounties), 4 victory paths.

**Absent or shallow (the opportunity space):**

| Gap | State | Bucket |
|---|---|---|
| Naval / embarkation / ships | **absent** — water hemisphere is dead space | Full · Civ‑like |
| City‑states / minor civs | **absent** — only barbarians are neutral | Civ‑like · Alive |
| Tribal villages (goody huts) | **absent** — exploration unrewarded | Alive |
| Natural wonders | **absent** | Alive · Full |
| Random / narrative events | **absent** — RNG used only for barbs+combat | **Alive** |
| Leader personalities & agendas | **absent** — every AI plays identically | **Alive** · Civ‑like |
| Great people (named figures) | **absent** — specialists give yields, no GPP | Full · Civ‑like |
| Golden / dark ages, era score | **absent** — eras are labels only | Civ‑like · Alive |
| Tech boosts (eureka/inspiration) | absent — flat linear research | Civ‑like |
| Roads / rivers | absent — map is tactically flat | Full |
| Unit/building maintenance, upkeep | absent — no gold pressure, no hard tradeoff | Civ‑like |
| Richer deals (resources/cities/techs), alliances, pacts | absent — deals are gold/borders/peace only | Civ‑like |
| Religious units (missionaries) + religious victory | absent — passive spread only | Full |
| City loyalty / rebellion / war‑weariness | absent — captured cities only carry a happiness penalty | Civ‑like |
| Espionage / intrigue | absent | Civ‑like |
| Production queue · national wonders | single slot · none | Full |
| Civilopedia · tooltips · victory‑progress · demographics | **absent** | **Contained** |
| Era ceremony · milestone banners · game chronicle | **absent** — wonders/eras/religions found silently | **Contained · Alive** |

### 1.4 The three structural holes

1. **No late game.** Content stops at Renaissance (4 of ~9 eras). *Lowest priority for
   "feel" — adding eras is a content treadmill, not a life injection.*
2. **No water/air domain.** `UnitDef.domain` is typed `'land'` only; ocean exists but
   nothing can cross or fight on it. *The one true XL structural bet.*
3. **Zero civ differentiation.** 4 civs, none with a unique ability/unit/building.
   *Highest‑value of the three for replay — and it folds neatly into the leaders work.*

### 1.5 The core finding: an "aliveness" deficit

The simulation is deep but **inert and silent**. Concretely, from the audit:

- **Every AI plays identically.** `CivDef` carries only a leader *name* string; attitude
  weights are global constants shared by all AIs. There is no aggressive vs. builder
  vs. zealot — there are four reskins of one brain.
- **Nothing happens that an actor didn't directly cause** (except barbarian spawns). No
  events, no flavor, no ambient world.
- **The world's reactions are invisible.** The attitude model *does* react to your wars,
  borders, and crowding — but the player only sees a denounce toast. No "X is wary of
  your expansion," no reaction to your wonders or score (wonders/score don't even feed
  attitude).
- **Milestones pass without ceremony.** Founding a religion, finishing a wonder,
  advancing an era, earning a golden age — all silent. The game never narrates itself.

This is the gap between "a correct simulation" and "a world." It is also the cheapest to
close, because the plumbing (RNG, attitude, event routing) already exists.

---

## 2. Design compass (from research)

- **Soren Johnson (Civ IV, Old World): depth from *interesting decisions*, not
  complexity.** "Adding elements is a way to make the game richer without increasing
  complexity." And: pick *one cohesive answer*, don't bolt on every good idea. → Favor
  additions that create new *decisions* and cohere, over raw content volume.
- **Old World's event/character system is the textbook "alive" lever.** A *virtual deck*
  of events with **triggers → requirements → effects**, keyed on *subjects* (characters,
  cities, religions, wars) so arcs emerge without scripted trees. Design rules he gives:
  **transparency** (players see the mechanic, not hidden dice), **loose coupling**
  (events co‑exist modularly; no fragile trees), **asymmetric outcomes** (same action,
  different story each game). Events "disrupt the steady bucket‑filling flow of a 4X."
  *This maps almost 1:1 onto Alvorada's dormant deterministic RNG.*
- **Civ VI Rise & Fall: era score → golden/dark ages, loyalty, governors, emergencies,
  city‑states, great people.** These are the canonical "full / civ‑like" pillars; era
  score + ages turn the existing era labels into momentum swings, and pair perfectly
  with a chronicle and ceremonies.
- **Exploration must pay.** Goody huts + natural wonders are *the* early‑game life
  injectors — and Alvorada is almost entirely an early/mid‑game.

### Constraints any addition must respect (from PLAN.md / the specs)

- **Determinism:** all randomness via in‑state `rngState`; no `Math.random`/`Date`/
  transcendentals in engine/ai; sorted iteration; AI is a pure fn of `(state, player)`.
- **Layering:** `data → engine → ai → app → ui`; UI never imports `src/ai`; AI uses only
  its own fog (fair AI).
- **Data‑driven:** content + balance live in `Ruleset` data, never in logic.
- **Schema:** bump `SCHEMA_VERSION` per slice; old autosaves are dropped (no migrator).
- **2D canvas only** (a 3D rewrite was tried and discarded — do not re‑propose).

---

## 3. The list — what to add (prioritized)

Effort: **S** ≈ days · **M** ≈ 1 wk · **L** ≈ 2 wks · **XL** ≈ a month+.
Each item is tagged with which of your four words it serves.

### TIER 1 — Make the existing depth *felt* (highest leverage, low structural risk)

**T1 · Track "The Living World"** — *reuses dormant RNG + attitude + event routing.*

| # | Addition | Effort | Serves | Why |
|---|---|---|---|---|
| 1 | **Leader personalities & agendas.** Add traits (aggressive / expansionist / pious / scientific / mercantile…) + a per‑leader agenda to `CivDef`; bias the AI priority lists and the attitude weights by them. | S–M | **Alive**, Civ‑like, Full | Converts four identical brains into characters. Highest impact‑per‑line in the whole audit. Also the cheapest path to civ differentiation. |
| 2 | **Deterministic event & chronicle system.** A data‑driven "virtual deck": each event = `trigger + requirements + weighted effects + choice(s)`, keyed on subjects (city, war, religion, leader). Ship ~25–40 events (city celebration, plague, migrants, rebel uprising, resource find, omen, rival drama). Plus a persistent **Chronicle** — a scrollable history of the game. | M–L | **Alive**, Contained, Civ‑like | The #1 "something happened I didn't cause" injector (Old World's core). The Chronicle delivers "contained": the game finally tells its own story. RNG infra already exists. |
| 3 | **Surfaced rival reactivity + "doings of the world" feed.** Wire wonders/score into `attitude()`; broadcast rival foundings/wars/wonders/religions to all who've met them; ambient lines ("Hammurabi is wary of your expansion," "Pericles admires your wonder"). | S | **Alive**, Contained | Turns the already‑computed attitude model into *felt* social pressure. Mostly notification routing + a couple of attitude factors. |

**T1b · Track "Legibility & the Finish Line"** — *pure UI on existing data; near‑zero engine risk.*

| # | Addition | Effort | Serves | Why |
|---|---|---|---|---|
| 4 | **Civilopedia / in‑game reference.** Searchable entries for every tech/unit/building/policy/belief/terrain (the data is already in `gameCtx.rules`). | M | **Contained**, Full | The game stops being opaque; every term becomes learnable in place. |
| 5 | **Tooltips everywhere.** Hover cards on tech/civic/building/promotion/belief nodes showing *effects*, not just name+cost. | S–M | **Contained** | Removes guesswork from every choice — biggest clarity win per hour. |
| 6 | **Victory‑progress screen.** All four paths with % to each (capitals held, science path, culture banked, score ratio). | S–M | **Contained**, Civ‑like | Gives the player a goal and a finish line — the literal core of "contained." |
| 7 | **Era ceremony + milestone banners.** Full‑screen beat on era advance; celebratory cards for wonders / religions / golden ages / great people (all silent today). | S | **Contained**, **Alive** | The highest "alive" beat for the lowest effort; marks progress with weight. |
| 8 | **Demographics / rivals comparison + post‑game summary.** Ranked power/science/gold/pop bars vs. met civs; itemized end‑game recap. | M | Contained, Alive | Turns isolated numbers into a living competition and gives closure. |

### TIER 2 — The "full / civ‑like" pillars (new but bounded systems)

| # | Addition | Effort | Serves | Why |
|---|---|---|---|---|
| 9 | **City‑states / minor civs.** Neutral single‑city actors with an envoy/influence race, quests, tribute, and bonuses. (Part of the team's deferred map/world track.) | L | **Civ‑like**, Alive, Full | Restores a whole pillar of Civ interaction — a populated middle layer to engage peacefully. |
| 10 | **Tribal villages (goody huts) + natural wonders.** One‑time exploration rewards (gold/map/tech/scout); map‑placed natural wonders with yields & first‑to‑find bonus. | S–M | **Alive**, Full, Civ‑like | Makes the early map — i.e. most of this game — worth exploring and full of discovery. |
| 11 | **Great people as named figures.** GPP from specialists/wonders → named characters (Aristotle, Sun Tzu…) with one‑shot or settle effects; feed golden ages. | M | **Full**, Alive, Civ‑like | The marquee long‑term payoff; gives the player memorable historical figures, not abstract yields. |
| 12 | **Golden / dark ages + era score.** "Historic moments" earn era score → golden/dark ages with real momentum swings. Pairs with #2 (chronicle) and #7 (ceremony). | M | Civ‑like, Alive, Contained | Turns the existing era labels into the game's pacing heartbeat. |

### TIER 3 — Bigger bets & deepen‑existing (sequence by appetite)

| # | Addition | Effort | Serves | Why |
|---|---|---|---|---|
| 13 | **Naval & rivers (the map/world half of track 5).** Embarkation + ships + naval combat; rivers (movement/defense/fresh water); coastal buildings/harbors. | **XL** | **Full**, Civ‑like | The team's explicitly largest deferred change. Opens the dead water hemisphere. Optional: map‑gen guarantees same‑continent starts today. |
| 14 | **Richer diplomacy.** Trade resources/cities/techs in deals; alliances & defensive pacts; demands/tribute‑or‑fight; war‑weariness; AI denouncements & proactive offers. | M | Civ‑like, Alive | Rivals currently never speak first except to surrender. Hooks were "left where cheap." |
| 15 | **Economic pressure.** Unit/building maintenance & upkeep, bankruptcy. | S–M | Civ‑like | Income exists but nothing costs upkeep, so there's no hard economic tradeoff. (Balance carefully.) |
| 16 | **Deepen‑existing grab‑bag.** Religious units (missionaries) + religious victory; civics slots/swapping; tech boosts (eureka); production queue; national wonders; city loyalty/rebellion; unit‑composition AI (mixed armies). | S–M each | Various | Each closes a named shallow spot; pick the ones that pair with the chosen track. |
| 17 | **Content breadth.** Civ unique abilities/units/buildings (needs a schema field — high value); more luxuries with distinct effects; an Industrial era; more wonders. | M–L | Full | Lowest priority for *feel*; civ uniques are the exception (do those with #1). |

---

## 4. Recommended sequence

The logic: **buy the most "alive + contained" per unit of effort and risk first.** That
means the dormant‑infrastructure reuses (Tier 1) before the new bounded systems (Tier 2)
before the structural bet (Tier 3). It also keeps each slice a *cohesive answer*, matching
the team's established spec→plan→implementation track rhythm.

1. **"The Living World"** (#1 leaders → #3 reactivity → #2 events+chronicle). Start with
   leaders (cheap, unlocks character for everything after), add reactivity (cheap, reuses
   attitude), then the event/chronicle system (the big alive payoff). *This one track
   does the most for "alive."*
2. **"Legibility & Finish Line"** (#5 tooltips → #6 victory‑progress → #7 ceremony → #4
   civilopedia → #8 demographics). Can run in parallel with #1 — it's a different layer
   (UI only). *This one track does the most for "contained."*
3. **One Tier‑2 pillar** to taste — **#10 goody huts + natural wonders** is the cheapest
   "full/alive" win and fits the early‑game focus; **#9 city‑states** is the biggest
   "civ‑like" win; **#11 great people** + **#12 ages** pair beautifully with the chronicle.
4. **The big bet** — **#13 naval/rivers** if you want to open the water hemisphere; or
   **#14 richer diplomacy** + the **#16 grab‑bag** if you'd rather keep deepening land.

### Mapping to your four words

| Your word | Means | Delivered most by |
|---|---|---|
| **Alive** | the world acts, reacts, and has characters | #1 leaders, #2 events, #3 reactivity, #10 goody huts, #11 great people |
| **Full** | enough systems & content to feel complete | #9 city‑states, #11 great people, #13 naval, #17 civ uniques |
| **Contained** | a cohesive, legible, bounded story with a finish line | #2 chronicle, #4 pedia, #5 tooltips, #6 victory‑progress, #7 ceremony |
| **Civilization‑like** | the genre's signature pillars | #9 city‑states, #11 great people, #12 ages, #13 naval, #14 diplomacy |

---

## 5. What I deliberately did *not* put first (and why)

- **More late‑game eras (Industrial+).** A content treadmill that adds hours, not life.
  Lowest priority for the stated goal.
- **A 3D renderer.** Tried and discarded; the 2D art direction is a strength.
- **Espionage as a first move.** High complexity for the current scope; revisit after the
  Living World makes rivals feel like people worth spying on.
- **Multiplayer netcode.** The determinism wall is already built for it; it's a separate
  deferred goal, not part of "alive/full/contained."

---

*Next step: pick the track to take into a full spec (brainstorm → spec → plan), and we'll
design it in detail respecting the determinism / data‑driven / schema‑bump constraints.*
