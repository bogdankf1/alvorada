# Diplomacy v1 — Design Spec

**Date:** 2026-06-13
**Status:** Approved (ready for implementation planning)
**Sub-project:** first of the "completed Civ" expansion sequence

## 1. Goal & summary

Turn rival civilizations from war-or-nothing targets into negotiating powers with
opinions. Build a **deal-making** diplomacy system on top of the existing peace/war
relations seed: make peace, grant open borders, declare friendship, denounce, and trade
**peace · lump gold · gold-per-turn · open borders** through a negotiation table. The AI
forms a deterministic, self-explaining **attitude** (Friendly→Hostile), **values** offers,
**accepts / rejects / counters**, and **initiates** proposals. Diplomacy is conducted in a
full-screen **Foreign Affairs council**, with a compact modal when the AI proposes to you.
AI↔AI diplomacy is active (rivals deal with each other, not only with the human).

This sub-project doubles as the reference implementation of the project's extension thesis:
**a new system = a state slice + actions + handlers + an AI evaluator + UI**, with no rewrite
of the core. It must preserve every invariant in PLAN.md §3.3 (determinism) and §2 (layering).

## 2. Scope

**In:**
- Relation states beyond war/peace: mutual **friendship**, directional **denouncement**.
- **Make peace** (end a war by mutual agreement).
- **Open borders** (directional, fixed term) — foreign military may transit your land.
- **Gold** (lump sum, either direction) and **gold-per-turn** (fixed term, auto-cancelled by war).
- **AI attitude**: integer score from signed, reasoned factors → 5 bands, surfaced with a "why".
- **AI deal valuation**: accept / reject / **counter**, with the bar scaled by attitude.
- **AI-initiated proposals** to the human (modal) and **AI↔AI** auto-resolution.
- Full-screen **Foreign Affairs** council UI + proposal modal + top-bar entry.

**Out (deferred; hooks left where cheap):**
- Strategic-resource leasing, luxury resources, city-ceding in deals, embassies, research
  agreements (deal-token system is extensible — new tokens are additive).
- Alliances / defensive pacts / joint war, demands & tribute-or-fight, war-weariness,
  war re-declaration cooldown, forced unit ejection when borders close.
- Save migration (old v1 saves are dropped, see §4).

## 3. Data-driven definitions (no hardcoded balance)

Per the project's data-driven rule, all diplomacy constants live in the ruleset, not in
logic. Add a `diplomacy` block to `RulesetSettings`:

```ts
interface DiplomacySettings {
  termLength: number;            // turns an open-borders / gold-per-turn deal lasts (default 30)
  goldPerTurnHorizon: number;    // turns of gold-per-turn the AI values up front (default 20)
  proposalTtl: number;           // turns a pending proposal stays open (default 1)
  grudgeOnWar: number;           // grudge stamped when someone declares war on you (default 30)
  grudgeOnCapture: number;       // additional grudge when they capture your city (default 20)
  grudgeDecay: number;           // grudge lost per turn (default 2)
  // attitude factor weights (signed integers)
  attitude: {
    atWar: number;               // -60
    grudgePerPoint: number;      // -1 per grudge point (so fresh war ≈ -30)
    denounced: number;           // -25 (each direction that applies)
    friendship: number;          // +40
    borderFriction: number;      // -15 when territories touch
    favorableDeal: number;       // +15 when you net-receive gold/turn or hold their open borders
    landCompetition: number;     // -10 when their city sits within `competitionRange`
    strongerRival: number;       // -10 when their power > 1.5x yours
    weakerRival: number;         // +5 when your power > 1.5x theirs
    competitionRange: number;    // tiles (default 4)
  };
  // attitude band thresholds (score >= value → band), checked high to low
  bands: { friendly: number; cordial: number; neutral: number; wary: number }; // 40/15/-15/-40; below wary = hostile
  // AI accept margins by band: AI accepts if netValueToAI >= margin[band]
  acceptMargin: { hostile: number; wary: number; neutral: number; cordial: number; friendly: number };
  // -10/0/8/20/40 (friendly accepts slightly unfavorable; hostile demands a premium)
  counterWindow: number;         // if netValueToAI within [margin-counterWindow, margin), AI counters (default 30)
  minFriendAttitude: 'cordial';  // band at/above which the AI will agree to friendship
}
```

Starting values are given inline as defaults; they are tuning knobs, not engine logic, and
may be rebalanced via the self-play harness without code changes.

## 4. State model (enriched relations matrix — option a)

Replace the flat `relations: ('peace'|'war')[][]` with a directional record matrix. Cell
`relations[a][b]` describes **a's stance and obligations toward b**.

```ts
interface RelationState {
  status: 'peace' | 'war';   // symmetric: relations[a][b].status === relations[b][a].status
  since: number;             // turn the status last changed (symmetric)
  met: boolean;              // a and b have encountered each other (symmetric); sticky once true
  friends: boolean;          // mutual declared friendship (symmetric)
  denounced: boolean;        // a has denounced b (directional)
  openBordersUntil: number;  // a grants b transit until this turn (0 = none; directional)
  goldPerTurn: number;       // a pays b this much each turn (directional)
  goldUntil: number;         // gold-per-turn runs until this turn (0 = none)
  grudge: number;            // a's grudge toward b; decays each turn (directional)
}
```

Symmetric fields (`status`, `since`, `friends`) are always written to both `[a][b]` and
`[b][a]`. Directional fields are written only to the owning cell.

Pending proposals are **transient**, not durable pair-state, so they live in a separate list:

```ts
interface DealItems {
  gold: number;                              // lump sum the side provides (0 = none)
  goldPerTurn?: { amount: number; turns: number };
  openBorders?: boolean;                     // this side grants the other transit
  peace?: boolean;                           // mutual (both sides set it to end a war)
  friendship?: boolean;                      // mutual (both sides set it)
}
interface Proposal {
  id: number;
  from: PlayerId; to: PlayerId;
  give: DealItems;                           // what `from` provides
  take: DealItems;                           // what `from` asks of `to`
  expiresTurn: number;
}
```

Add to `GameState`: `relations: RelationState[][]`, `proposals: Proposal[]`,
`nextProposalId: number`. Bump `SCHEMA_VERSION` 1 → 2.

**Old saves:** dropped, no migration. `deserializeGame` already throws on a schema mismatch;
`loadAutosave` already catches and returns `null`, so a stale v1 autosave silently yields no
"Continue" button. Verify this path; add no migrator.

`initialState` builds the matrix with `status:'peace', since:1, friends:false, denounced:false,
openBordersUntil:0, goldPerTurn:0, goldUntil:0, grudge:0` for every ordered pair (diagonal
left at defaults / unused).

## 5. Actions (pure, validated, replayable)

All carry `player` and flow through `validate` + `reduce` like every existing action.

- **`PROPOSE_DEAL { player, to, give, take }`** — `player` offers a deal to `to`.
  - Validate: `to` is alive, met (§7), not self; `give`/`take` are well-formed; lump gold in
    `give` ≤ player's gold and in `take` ≤ `to`'s gold; `peace` only if currently at war;
    `friendship` only if at peace and not already friends; `openBorders` only if not already
    granted; `goldPerTurn.turns` > 0.
  - Reduce: if `to` is AI-controlled → resolve immediately via valuation (§6): **accept** →
    apply the deal (§5.1) + event; **reject** → event; **counter** → push a new `Proposal`
    from `to` back to `player` (the AI's adjusted terms). If `to` is human-controlled → push
    the proposal (this path is how the AI proposes to you; see §6).
- **`RESPOND_DEAL { player, proposalId, accept }`** — answer a proposal addressed to `player`.
  - Validate: proposal exists, `to === player`, still affordable.
  - Reduce: `accept` → apply (§5.1); always remove the proposal; events both ways.
- **`DENOUNCE { player, to }`** — unilateral, immediate.
  - Validate: `to` alive, met, not self, not already denounced.
  - Reduce: set `relations[player][to].denounced = true`; if `friends`, clear friendship both
    ways; bump `relations[to][player].grudge` modestly; event (audience: all).
- **`DECLARE_WAR { player, target }`** (existing) — extended.
  - Reduce additions: set `status:'war'`, `since:turn` both ways; **cancel all pacts/flows**
    between the pair (`openBordersUntil=0`, `goldPerTurn=0`, `goldUntil=0` both directions);
    clear `friends`; stamp `relations[target][player].grudge += grudgeOnWar`; drop any pending
    proposals between the pair.

### 5.1 Applying a deal (mutual)
Given an accepted `{from, to, give, take}`, apply `give` from `from`→`to` and `take` from
`to`→`from`:
- `peace` on both sides → set peace both ways, `since=turn`, cancel pacts/flows (war is over).
- `friendship` on both sides → `friends=true` both ways.
- `gold` (lump) → transfer payer→payee immediately.
- `goldPerTurn` → set `relations[payer][payee].goldPerTurn=amount`, `goldUntil=turn+turns`.
- `openBorders` → set `relations[granter][grantee].openBordersUntil = turn + termLength`.

A deal that includes `peace` requires the pair to be at war; accepting it is the only peace
path besides conquest.

## 6. Diplomacy model & AI decisions (deterministic + explainable)

`attitude` and `valueDeal` are **pure engine read-model functions** (deterministic,
data-driven via §3 settings), living in the engine so both the AI *and* the UI verdict line
can call them without the UI ever importing the AI layer (PLAN.md §2). The AI layer
(`src/ai/diplomacy.ts`) only makes *decisions* on top of them: whether to accept, what to
counter with, what to propose.

**Attitude** — `attitude(ctx, state, viewer, other) → { score, band, factors: {label, delta}[] }`,
a pure integer sum of the §3 weighted factors (war, grudge, denouncement, friendship, border
friction, favorable active deals, land competition, power imbalance). Bands from
`settings.diplomacy.bands`. The `factors` list drives the "▸why" UI and mirrors the existing
explainable-AI "Counsel" pattern. Fairness: attitude uses only met-power facts the civ would
plausibly know (relation flags, adjacency to known cities, broad power comparison).

**Deal valuation** — `valueDeal(ctx, state, recipient, proposal) → number`, the net worth of a
proposal *to its recipient* = value(items received) − value(items given). The AI uses it with
`recipient = ai`; the UI verdict line uses it with `recipient = the rival` to predict their
answer honestly. Item values:
- lump gold: face value.
- gold-per-turn: `amount × min(turns, goldPerTurnHorizon)` (integer).
- open borders granted **to** the AI: small positive scaled by attitude; granted **by** the
  AI: a cost that is prohibitive when Hostile (won't let enemies walk through), cheap when
  Friendly.
- peace: when the AI is at war, value rises with how badly the war is going for it (compare
  own vs. enemy known military power, own city HP under threat); when winning, peace is worth
  little (it would rather extract tribute — modelled by demanding gold in a counter).
- friendship: no direct gold value; the AI only agrees when attitude ≥ `minFriendAttitude`.

**Decision** (`src/ai/diplomacy.ts`) — let `margin = acceptMargin[band]` and `net =
valueDeal(ctx, state, ai, proposal)`. If `net ≥ margin` → **accept**. Else if `net ≥ margin −
counterWindow` → **counter**: clone the proposal and close the gap by adding a lump-gold demand
of `margin − net` to the AI's `take` (capped by the proposer's treasury; if uncloseable,
reject). Else → **reject**. Integer math, sorted iteration over players/items — identical
inputs yield identical verdicts forever.

**AI-initiated proposals** — during an AI player's turn (in the AI decision module, emitted as
normal actions), the AI may, at most once per turn (non-spammy), propose: **peace** when
losing a war; **friendship** when attitude ≥ Cordial and at peace and not already friends;
**open borders** when it wants transit toward an exploration/war target. Targets may be the
human (→ queued proposal, surfaced as a modal at the human's turn-start) or another AI
(→ resolved immediately via the same valuation, since both sides are deterministic).

## 7. "Met" gating & selectors

You may only negotiate with powers you have **met**: you've seen one of their units or cities,
or your territories touch (any tile with `visibility ≥ explored` that they own, or a visible
unit). Add `hasMet(state, a, b)` (symmetric; persisted as a `met: boolean` flag set when first
satisfied, so it survives losing sight). New selectors: `metPlayers(viewer)`,
`attitude(...)` (above), `relationBadges(viewer, other)`, and
`canEnterForeignTile(ctx, state, mover, tileOwner)` (peace + open-borders aware).

*Note:* `met` adds one symmetric boolean to `RelationState` (`met: boolean`), set during
visibility recompute / unit sighting.

## 8. Turn loop & obligations

Extend `beginTurn(player p)` (runs in the reducer, so it replays):
1. **Pay gold-per-turn owed by p:** for each other player o with
   `relations[p][o].goldPerTurn > 0` and `turn ≤ relations[p][o].goldUntil`: transfer
   `amount` from p to o. If p can't afford it → break that flow (`goldPerTurn=0, goldUntil=0`),
   emit a "deal broken" event, and bump `relations[o][p].grudge` (a minor betrayal).
2. **Expire p's outgoing terms:** `openBordersUntil < turn → 0`; `goldUntil < turn →
   goldPerTurn=0`.
3. **Decay p's grudges:** `grudge = max(0, grudge − grudgeDecay)` for each pair.
4. **Expire & surface proposals addressed to p:** drop those past `expiresTurn`; the driver
   surfaces the newest remaining proposal `to === p && p is human` as a modal at turn-start.

All per-player so the work is deterministic and attributable to p's turn.

## 9. Pathfinding / borders integration

`moveRulesFor` currently blocks entering a peaceful foreign-owned tile. Change the border
check to also allow entry when the owner has granted the mover open borders
(`relations[owner][mover].openBordersUntil ≥ turn`). War still allows entry (as today).
No forced ejection when a pact lapses (documented simplification): units already inside simply
can't advance further once access ends.

## 10. UI (engine-agnostic; reads selectors, emits actions)

- **Top bar:** add a **"Powers"** entry (beside Counsel/Menu) opening the council. A badge dot
  appears when a proposal awaits you.
- **Foreign Affairs council** — new `overlay: 'diplomacy'`, full-screen scrim like the tech
  tree. Left: **Known Powers** list (met civs only) — leader, civ color dot, attitude
  band+label, war/peace/friendship/denounced badges, `[Talk]`. Selecting one opens the
  **two-column deal table** (They give | You give) with rows per token: lump-gold inputs,
  gold-per-turn (amount × fixed term), open-borders checkbox, make-peace checkbox (only when at
  war), declare-friendship checkbox (only at peace). A live **verdict line** calls the shared
  engine `valueDeal` (recipient = the rival) plus their accept margin ("They would accept." /
  "You'll need to offer more." / "They refuse to deal.") so the player gets honest feedback
  before proposing. `[Propose]` →
  `PROPOSE_DEAL`; `[Clear]`. An attitude **▸why** expander lists the factor breakdown.
- **Proposal modal** — when a proposal is pending for you (turn-start or after a counter), a
  compact modal (WarConfirm style): leader, "They give / They ask", `[Accept] [Reject]`.
- **Notifications:** new event types `friendship`, `denounce`, `dealAccepted`, `dealRejected`,
  `dealBroken`, `bordersOpened`, plus existing `war`. Audience-tagged; clickable toasts.
- **Map:** no new map art for v1 (open borders is a movement rule, not a visual). Optional
  later: tint foreign tiles you may transit.

Store additions (`AppState`): `overlay` gains `'diplomacy'`; `diploTarget: PlayerId | null`
(selected power); `draftDeal` (the in-progress table state); pending-proposal surfacing reuses
the events/driver path. Engine stays free of all of this.

## 11. Determinism & multiplayer-readiness

- Every change flows through `validate` + `reduce`; no hidden mutation. Proposals and the
  relations matrix are plain serializable JSON in `GameState`.
- Attitude and valuation are pure integer functions with sorted iteration — no `Math.random`,
  no transcendentals (PLAN.md §3.3). AI proposals are emitted as ordinary actions, so an AI
  game is still `init ⊕ actions[]`.
- AI↔AI deals resolve synchronously inside the proposer's action, keeping the log replayable.
- Schema bumped to 2; old saves dropped (§4).

## 12. Testing

- **Unit:** attitude factor math & banding; valuation symmetry (AI never accepts below its
  band margin; counters only inside the window); accept/reject/counter branches; deal
  application for each token; obligation tick (gold-per-turn transfer, break on insolvency,
  expiry); grudge decay; war cancels pacts + clears friendship + stamps grudge; denounce
  cancels friendship; open-borders pathing (granted lets transit, lapsed blocks); met gating;
  proposal TTL expiry; validation rejections (unaffordable, peace-without-war, friendship-at-war,
  self/ unmet targets).
- **Replay:** a scripted diplomacy game (propose → counter → accept, friendship, denounce,
  gold-per-turn over several turns, make peace) re-applied from its log → deep-equal +
  identical `gameHash`.
- **Self-play:** extend the 4-AI harness so rivals negotiate; assert at least some deals occur,
  only legal actions are emitted, no stuck turns, games still reach a verdict by the limit, and
  the full AI log replays bit-identically. Add a balance line for deals made / wars
  ended-by-treaty.

## 13. File-by-file change map (head start for the plan)

- `src/data/types.ts` — `DiplomacySettings`; extend `RulesetSettings`.
- `src/data/standard/index.ts` — `diplomacy` settings block with starting values.
- `src/engine/types.ts` — `RelationState`, `DealItems`, `Proposal`; `GameState` fields;
  4 new `Action` variants; bump notes.
- `src/engine/serialize.ts` — `SCHEMA_VERSION = 2`.
- `src/engine/state.ts` — build the relations matrix; init `proposals`, `nextProposalId`.
- `src/engine/selectors.ts` — `atWar` (read `.status`), `hasMet`, `metPlayers`,
  `relationBadges`, `canEnterForeignTile`.
- `src/engine/diplomacy-eval.ts` — **new**: pure `attitude` and `valueDeal` (the shared,
  data-driven diplomacy model used by both the AI and the UI verdict line; no decisions).
- `src/engine/map/pathfind.ts` — open-borders-aware border check.
- `src/engine/map/visibility.ts` — set `met` on first sight.
- `src/engine/systems/diplomacy.ts` — **new**: apply-deal, denounce, obligation processing,
  proposal lifecycle.
- `src/engine/systems/turn.ts` — call diplomacy obligation processing in `beginTurn`.
- `src/engine/systems/combat.ts` / `cities.ts` — grudge bump on capture.
- `src/engine/validate.ts` — validation for the 4 new actions; extend `DECLARE_WAR`.
- `src/engine/reducer.ts` — handlers for the 4 new actions; extend `DECLARE_WAR`.
- `src/ai/diplomacy.ts` — **new**: decisions only — `respondToProposal` (accept/reject/counter)
  and `initiateProposals` (peace/friendship/open-borders), built on the engine's `valueDeal`/`attitude`.
- `src/ai/decide.ts` — emit diplomacy actions (respond to pending proposals; initiate peace/
  friendship/open-borders); consult attitude in war decisions.
- `src/ui/panels/ForeignAffairs.tsx` — **new** council overlay + deal table.
- `src/ui/panels/Modals.tsx` — proposal modal.
- `src/ui/panels/TopBar.tsx` — "Powers" entry + pending badge.
- `src/ui/diplomacy.ts` — **new** UI helpers (verdict line via the engine's `valueDeal`,
  draft-deal state, attitude colors).
- `src/app/store.ts` / `driver.ts` — `'diplomacy'` overlay, `diploTarget`, surface proposals.
- `src/ui/app.css` — council, deal table, badges, proposal modal styles.
- `tests/diplomacy.test.ts`, `tests/replay.test.ts`, `tests/selfplay.test.ts` — coverage above.

## 14. Success criteria

1. Human can open Foreign Affairs, see each met rival's attitude with a "why", build a deal,
   read an honest verdict, and propose it; the AI accepts/rejects/counters consistently.
2. Wars can end by negotiated peace; friendship and denouncement work and move attitude.
3. Gold-per-turn and open borders take effect, tick, expire, and break on war — verified.
4. The AI proposes sensibly (peace when losing, friendship when warm) and AI↔AI deals happen.
5. All existing tests pass; new unit + replay + self-play tests pass; a 4-AI game still ends
   and replays bit-identically. No `Math.random`/transcendentals in engine or AI.
6. Engine/UI separation intact (engine imports no DOM/React); all balance values in ruleset data.
