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
}
export type PartialYields = Partial<Yields>;

export const YIELD_KEYS = ['food', 'production', 'gold', 'science', 'culture'] as const;
export type YieldKey = (typeof YIELD_KEYS)[number];

export type UnitClass = 'civilian' | 'melee' | 'ranged' | 'mounted' | 'siege';
export type UnitAbility = 'foundCity' | 'improve';

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
  kind: 'bonus' | 'strategic';
  yields: PartialYields; // delta, applies once the owner has revealedBy
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

export interface UnitDef {
  id: string;
  name: string;
  cost: number; // production hammers
  moves: number;
  sight: number;
  strength: number; // melee attack & defense strength
  ranged?: { strength: number; range: number };
  class: UnitClass;
  domain: 'land'; // extension point: 'sea', 'air'
  abilities?: UnitAbility[];
  bonuses?: { vsClass?: UnitClass; vsCity?: boolean; pct: number }[];
  requiresTech?: string;
  requiresResource?: string; // strategic resource consumed while alive
  art: { glyph: string };
}

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  yields: PartialYields;
  perPop?: { yield: YieldKey; per: number }; // +1 yield per `per` population
  defense?: { strength: number };
  requiresTech?: string;
  unbuildable?: boolean; // e.g. palace: granted, never produced
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

export interface CivDef {
  id: string;
  name: string;
  leader: string;
  color: string;
  cityNames: string[];
}

export interface EraDef {
  id: string;
  name: string;
}

export interface RulesetSettings {
  workRadius: number; // city works tiles within this distance
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
  victory: { scoreThreshold: number; turnLimit: number };
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
  units: Record<string, UnitDef>;
  buildings: Record<string, BuildingDef>;
  techs: Record<string, TechDef>;
  civs: Record<string, CivDef>;
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
    competitionRange: number; // tiles
  };
  bands: { friendly: number; cordial: number; neutral: number; wary: number }; // score >= → band; below wary = hostile
  acceptMargin: Record<AttitudeBand, number>; // AI accepts if netValueToRecipient >= margin[band]
  counterWindow: number; // AI counters when net is within [margin - counterWindow, margin)
  minFriendBand: AttitudeBand; // band at/above which the AI agrees to friendship
}

export const ZERO_YIELDS: Yields = { food: 0, production: 0, gold: 0, science: 0, culture: 0 };

export function addYields(into: Yields, delta: PartialYields | undefined): Yields {
  if (!delta) return into;
  for (const k of YIELD_KEYS) into[k] += delta[k] ?? 0;
  return into;
}

export function emptyYields(): Yields {
  return { ...ZERO_YIELDS };
}
