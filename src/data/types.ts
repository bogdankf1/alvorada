/**
 * Ruleset definition types. Everything the game "contains" — terrain, units,
 * techs, buildings, resources — is described by this data, never by engine code.
 * The engine receives a Ruleset as context; swapping rulesets swaps the game.
 */

export interface Yields {
  food: number;
  production: number;
  gold: number;
  science: number;
  culture: number;
  faith: number;
}
export type PartialYields = Partial<Yields>;

export const YIELD_KEYS = ['food', 'production', 'gold', 'science', 'culture', 'faith'] as const;
export type YieldKey = (typeof YIELD_KEYS)[number];

export type SpecialistType = 'scientist' | 'merchant' | 'artist' | 'engineer';
export interface SpecialistDef {
  name: string;
  yields: PartialYields;
}

export type BeliefKind = 'pantheon' | 'founder' | 'follower';
export interface CivicEffect {
  yields?: PartialYields;                                      // per city it applies to
  happiness?: number;                                          // empire happiness
  perBuilding?: { building: string; yields: PartialYields };   // e.g. +1 faith per Shrine
  influenceMult?: number;                                      // % tourism/influence (policies)
}
export interface BeliefDef { id: string; name: string; kind: BeliefKind; effect: CivicEffect; }

export interface PromotionEffect {
  attackPct?: number;
  defensePct?: number;
  vsClassPct?: { class: UnitClass; pct: number };
  vsCityPct?: number;
  movement?: number;
  healPerTurn?: number;
  healAlways?: boolean;
  ignoreZoc?: boolean;
}
export interface PromotionDef {
  id: string; name: string;
  classes?: UnitClass[]; // which unit classes may take it (undefined = any)
  requires?: string[];   // prerequisite promotion ids
  effect: PromotionEffect;
}
export interface PolicyDef { id: string; name: string; branch: string; cost: number; prereqs: string[]; effect: CivicEffect; }
export interface ReligionSettings {
  pantheonCost: number; religionCost: number; religionTech: string; maxReligions: number;
  spreadRange: number; pressurePerCity: number; holyCityBonus: number; holyCityFaithDiv: number;
}

export type UnitClass = 'civilian' | 'melee' | 'ranged' | 'mounted' | 'siege';
export type UnitAbility = 'foundCity' | 'improve' | 'trade';

export interface TerrainDef {
  id: string;
  name: string;
  water?: boolean;
  yields: PartialYields;
  moveCost: number; // cost to enter a tile of this terrain
  defenseBonus: number; // flat strength bonus for a defender standing here
  art: { fill: string; accent: string };
}

export interface ElevationDef {
  id: string;
  name: string;
  yields: PartialYields; // delta on top of terrain
  moveCostDelta: number;
  defenseBonus: number;
  impassable?: boolean;
  sightBonus?: number;
}

export interface FeatureDef {
  id: string;
  name: string;
  yields: PartialYields; // delta
  moveCostDelta: number;
  defenseBonus: number;
  removable?: boolean; // workers may clear it
}

export interface ResourceDef {
  id: string;
  name: string;
  kind: 'bonus' | 'strategic' | 'luxury';
  yields: PartialYields; // delta, applies once the owner has revealedBy
  happiness?: number; // luxury only: empire happiness when connected (default settings.happiness.luxuryHappiness)
  revealedBy?: string; // tech id; undefined = visible from the start
  improvedBy?: string; // improvement id that activates it (undefined = unimprovable)
  bonusImproved?: PartialYields; // extra delta once the matching improvement exists
  spawn: { terrains: string[]; elevations?: string[]; weight: number };
}

export interface ImprovementDef {
  id: string;
  name: string;
  turns: number; // worker-turns to build
  yields: PartialYields; // delta
  validTerrains?: string[];
  validElevations?: string[];
  requiresResource?: boolean; // only on a tile whose resource is improvedBy === this
  clearsFeature?: boolean; // chop: removes the feature on completion, builds nothing
  requiresTech?: string;
}

export interface RoadDef {
  id: string;
  name: string;
  moveCost: number;      // points to ENTER a tile carrying this road (unscaled)
  turns: number;         // worker-turns to build
  requiresTech?: string; // undefined = available from the start
}

export interface UnitDef {
  id: string;
  name: string;
  cost: number; // production hammers
  moves: number;
  sight: number;
  strength: number; // melee attack & defense strength
  ranged?: { strength: number; range: number };
  class: UnitClass;
  domain: 'land' | 'sea';
  abilities?: UnitAbility[];
  bonuses?: { vsClass?: UnitClass; vsCity?: boolean; pct: number }[];
  requiresTech?: string;
  requiresResource?: string; // strategic resource consumed while alive
  civ?: string; // if set, only this civ may build it
  replaces?: string; // base unit id this unique stands in for (that civ no longer builds the base)
  art: { glyph: string };
}

export type WonderEffect =
  | { kind: 'empireYields'; yields: PartialYields } // added to every city the owner holds
  | { kind: 'cityDefense'; strength: number } // +strength to all owner cities
  | { kind: 'freeTech' } // grant the cheapest available tech, once
  | { kind: 'freeUnit'; unit: string; count: number } // spawn units in the city, once
  | { kind: 'cultureBurst'; amount: number } // add culture to the city, once
  | { kind: 'happiness'; amount: number }; // empire-wide happiness while the owner holds the wonder

/**
 * A civ's signature ability. `empireCivic` reuses the policy/belief CivicEffect path
 * (per-city yields + empire happiness); `wonderProduction` adds flat hammers toward a
 * World Wonder. All values additive/integer (no multipliers) — see spec §2.
 */
export type CivAbility =
  | { kind: 'empireCivic'; effect: CivicEffect }
  | { kind: 'wonderProduction'; amount: number };

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

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  yields: PartialYields;
  perPop?: { yield: YieldKey; per: number }; // +1 yield per `per` population
  defense?: { strength: number };
  requiresTech?: string;
  civ?: string; // if set, only this civ may build it
  replaces?: string; // base building id this unique stands in for
  unbuildable?: boolean; // e.g. palace: granted, never produced
  wonder?: boolean; // a one-per-game World Wonder
  effect?: WonderEffect; // optional signature effect (beyond `yields`)
  happiness?: number; // empire-wide happiness contributed per city that has this building
  pacifies?: boolean; // clears an occupied city's unrest (Courthouse)
  specialistSlots?: { type: SpecialistType; count: number };
  art: { glyph: string };
}

export interface TechDef {
  id: string;
  name: string;
  era: string;
  cost: number; // science beakers
  prereqs: string[];
  pos: { col: number; row: number }; // tech-tree layout is data too
}

/** A one-shot, integer, player/capital-local event effect. */
export type EventEffect =
  | { k: 'gold'; n: number }
  | { k: 'science'; n: number }
  | { k: 'faith'; n: number }
  | { k: 'culture'; n: number }
  | { k: 'production'; n: number }   // toward the capital's current build
  | { k: 'popChange'; n: number }    // capital population (floored at 1)
  | { k: 'unit'; unit: string }      // spawn a unit at/near the capital
  | { k: 'reveal'; radius: number }; // explore tiles around the capital
export interface EventChoice { text: string; effects: EventEffect[]; aiBias?: number; }
export interface EventDef {
  id: string; title: string; body: string;
  minTurn?: number; requiresPop?: number; oncePerGame?: boolean;
  choices: EventChoice[]; // length<=1 = ambient (auto-resolves); >=2 = interactive (modal)
}

export interface CivDef {
  id: string;
  name: string;
  leader: string;
  color: string;
  cityNames: string[];
  uniqueAbility?: CivAbility[];
  traits?: string[]; // behavioral trait ids (playable civs; barbarians omit)
  agenda?: string;   // historical agenda id (revealed on meeting)
}

export interface EraDef {
  id: string;
  name: string;
}

export interface HappinessSettings {
  baseEmpire: number;
  perCity: number;
  perPop: number;
  freePopPerCity: number;
  occupiedExtra: number;
  luxuryHappiness: number;
  unhappyGrowthDivisor: number;
  veryUnhappyAt: number;
  veryUnhappyProdPenaltyPct: number;
}
export interface TradeRouteSettings {
  caravanRange: number;
  duration: number;
  domestic: PartialYields;
  international: PartialYields;
  internationalScience: number;
  internationalScienceTech: string;
  destinationGold: number;
  friendshipBonusPct: number;
  pillageBounty: number;
}

export interface RulesetSettings {
  workRadius: number; // city works tiles within this distance
  moveScale: number;
  cityMinDist: number; // min hex distance between city centers
  citySight: number;
  cityBaseStrength: number;
  cityStrengthPerPop: number;
  cityMaxHp: number;
  cityRegen: number;
  cityCaptureHp: number;
  capturePopLossQuarter: boolean; // captured city loses 1/4 pop
  foodConsumptionPerPop: number;
  sciencePerPopHalf: boolean; // +1 science per 2 pop
  damageBase: number;
  damagePerStrength: number;
  damageMin: number;
  damageMax: number;
  fortifyBonus: number;
  garrisonBonus: number;
  healOwn: number;
  healNeutral: number;
  healCity: number;
  purchaseMultiplier: number; // gold cost = multiplier x remaining production
  borderGrowth: { base: number; linear: number; quad: number }; // base + linear*n + quad*n^2
  borderMaxRadius: number;
  score: { city: number; pop: number; tech: number; strengthPer: number };
  victory: { scoreThreshold: number; turnLimit: number; scienceCapstone: string; culture: { dominanceFactor: number; minTurn: number; perWonder: number } };
  religion: ReligionSettings;
  happiness: HappinessSettings;
  tradeRoute: TradeRouteSettings;
  combat: { xpPerAttack: number; xpPerKill: number; xpPerDefend: number; xpVsBarbCap: number; promotionThresholds: number[] };
  barbarians: { campCount: number; startSafeRadius: number; spawnRadius: number; spawnEveryTurns: number; maxNearCamp: number; campBounty: number };
  tilePurchase: { baseCost: number; costPerRing: number; radius: number };
  naval: { embarkTech: string; embarkedDefense: number };
  startingUnits: string[];
  diplomacy: DiplomacySettings;
}

export interface Ruleset {
  id: string;
  terrains: Record<string, TerrainDef>;
  elevations: Record<string, ElevationDef>;
  features: Record<string, FeatureDef>;
  resources: Record<string, ResourceDef>;
  improvements: Record<string, ImprovementDef>;
  roads: Record<string, RoadDef>;
  units: Record<string, UnitDef>;
  buildings: Record<string, BuildingDef>;
  techs: Record<string, TechDef>;
  civs: Record<string, CivDef>;
  traits: Record<string, TraitDef>;
  agendas: Record<string, AgendaDef>;
  events: Record<string, EventDef>;
  specialists: Record<SpecialistType, SpecialistDef>;
  beliefs: Record<string, BeliefDef>;
  policies: Record<string, PolicyDef>;
  promotions: Record<string, PromotionDef>;
  eras: EraDef[];
  settings: RulesetSettings;
}

export type AttitudeBand = 'hostile' | 'wary' | 'neutral' | 'cordial' | 'friendly';

export interface DiplomacySettings {
  termLength: number; // turns an open-borders / gold-per-turn deal lasts
  goldPerTurnHorizon: number; // turns of gold-per-turn the AI values up front
  proposalTtl: number; // turns a pending proposal stays open
  grudgeOnWar: number; // grudge stamped on the victim when war is declared
  grudgeOnCapture: number; // extra grudge when a city is captured
  grudgeOnDenounce: number; // grudge stamped on the denounced party
  grudgeOnBrokenDeal: number; // grudge when a gold-per-turn obligation can't be paid
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
    agendaRespected: number;
    agendaDefied: number;
    sharedReligion: number;
    scoreLeader: number;
    admiredWonders: number;
    competitionRange: number; // tiles
  };
  bands: { friendly: number; cordial: number; neutral: number; wary: number }; // score >= → band; below wary = hostile
  acceptMargin: Record<AttitudeBand, number>; // AI accepts if netValueToRecipient >= margin[band]
  counterWindow: number; // AI counters when net is within [margin - counterWindow, margin)
  minFriendBand: AttitudeBand; // band at/above which the AI agrees to friendship
  hiddenAgendaRevealTurns: number; // turns of contact before a rival's hidden agenda shows
}

export const ZERO_YIELDS: Yields = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };

export function addYields(into: Yields, delta: PartialYields | undefined): Yields {
  if (!delta) return into;
  for (const k of YIELD_KEYS) into[k] += delta[k] ?? 0;
  return into;
}

export function emptyYields(): Yields {
  return { ...ZERO_YIELDS };
}
