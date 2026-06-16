/**
 * Core game-state types. The whole state is plain serializable JSON:
 * no class instances, no Maps/Sets, no functions, no Dates.
 * GameState + the action log fully determine a game (see PLAN.md §3.3).
 */
import type { AttitudeBand, Ruleset, SpecialistType } from '../data/types';

export type PlayerId = number;
export type UnitId = number;
export type CityId = number;

export interface Axial {
  q: number;
  r: number;
}

export interface Tile {
  terrain: string;
  elevation: string; // 'flat' | 'hill' | 'mountain' (data ids)
  feature: string | null;
  resource: string | null;
  improvement: string | null;
  ownerCity: CityId | null; // territory: derived from exactly one place
}

export type UnitOrder =
  | { kind: 'goto'; path: Axial[] } // remaining steps, executed across turns
  | { kind: 'build'; improvement: string; turnsLeft: number };

export type Stance = 'none' | 'fortified' | 'skipped';

export interface Unit {
  id: UnitId;
  owner: PlayerId;
  def: string;
  q: number;
  r: number;
  hp: number; // 0-100
  moves: number; // move points remaining this turn
  stance: Stance;
  acted: boolean; // moved/attacked since last turn-start (gates healing)
  order: UnitOrder | null;
  xp?: number;            // combat experience
  promotions?: string[];  // earned promotion ids
}

export interface ProductionItem {
  kind: 'unit' | 'building';
  id: string;
}

export interface City {
  id: CityId;
  owner: PlayerId;
  name: string;
  q: number;
  r: number;
  pop: number;
  food: number; // stored toward growth
  production: { item: ProductionItem | null; progress: number };
  buildings: string[];
  culture: number; // stored toward next border expansion
  tilesClaimed: number; // border expansions completed (sets the next threshold)
  hp: number;
  occupied?: boolean; // captured; adds unrest until a pacifying building is built
  forcedSpecialists?: Partial<Record<SpecialistType, number>>; // manual pinned minimums
  religion?: string | null;                    // majority religion id
  religiousPressure?: Record<string, number>;  // accumulated pressure per religion
}

export interface TradeRoute {
  id: number;
  owner: PlayerId;
  fromCity: CityId;
  toCity: CityId;
  kind: 'domestic' | 'international';
  expires: number; // absolute turn the route ends
  path: number[]; // tile indices, origin→destination (pillage + rendering)
}

export interface ReligionState {
  id: string;            // `rel_${founder}` — at most one religion per player
  name: string;
  founder: PlayerId;
  holyCity: CityId;
  founderBelief: string; // belief id (kind 'founder')
  followerBelief: string;// belief id (kind 'follower')
}

export interface RelationState {
  status: 'peace' | 'war'; // symmetric
  since: number; // turn status last changed (symmetric)
  met: boolean; // a and b have encountered each other (symmetric); sticky once true
  friends: boolean; // mutual declared friendship (symmetric)
  denounced: boolean; // a has denounced b (directional)
  openBordersUntil: number; // a grants b transit until this turn (0 = none; directional)
  goldPerTurn: number; // a pays b each turn (directional)
  goldUntil: number; // gold-per-turn runs until this turn (0 = none)
  grudge: number; // a's grudge toward b; decays each turn (directional)
  firstContactTurn?: number; // turn `met` first became true (symmetric); undefined until met
  lastBand?: AttitudeBand;   // subject's last-seen attitude band toward target (reactivity)
}

export function blankRelation(): RelationState {
  return {
    status: 'peace',
    since: 1,
    met: false,
    friends: false,
    denounced: false,
    openBordersUntil: 0,
    goldPerTurn: 0,
    goldUntil: 0,
    grudge: 0,
  };
}

export interface DealItems {
  gold: number; // lump sum this side provides (0 = none)
  goldPerTurn?: { amount: number; turns: number };
  openBorders?: boolean; // this side grants the other transit
  peace?: boolean; // mutual (both sides set to end a war)
  friendship?: boolean; // mutual (both sides set)
}

export interface Proposal {
  id: number;
  from: PlayerId;
  to: PlayerId;
  give: DealItems; // what `from` provides
  take: DealItems; // what `from` asks of `to`
  expiresTurn: number;
}

export interface Player {
  id: PlayerId;
  name: string; // leader name
  civ: string;
  color: string;
  controller: 'human' | 'ai'; // setup data for the driver; the engine never branches on it
  alive: boolean;
  techs: string[];
  researching: string | null;
  science: number; // stored toward current research
  gold: number;
  faith: number; // accumulates each turn like science/gold
  pantheon: string | null; // chosen pantheon belief id
  policies: string[];      // adopted policy ids (permanent)
  policyProgress: number;  // empire culture accumulated toward the next policy
  cultureTotal: number;    // lifetime empire culture (drives influence)
  nextCityName: number;
  barbarian?: boolean;
  traits?: string[];      // runtime traits (init from CivDef; events may alter later)
  hiddenAgenda?: string;  // seeded once per game from (seed, id)
}

export interface GameEvent {
  seq: number;
  turn: number;
  player: PlayerId | null; // audience; null = everyone
  type: string;
  msg: string;
  q?: number;
  r?: number; // optional map focus for the notification
}

export interface PlayerSpec {
  civ: string;
  controller: 'human' | 'ai';
  name?: string;
}

export interface GameConfig {
  seed: number;
  mapW: number;
  mapH: number;
  players: PlayerSpec[];
}

export const VIS_UNSEEN = 0;
export const VIS_EXPLORED = 1;
export const VIS_VISIBLE = 2;

export interface GameState {
  schema: number;
  rulesetId: string;
  config: GameConfig;
  rngState: number;
  turn: number;
  currentPlayer: PlayerId;
  phase: 'playing' | 'ended';
  mapW: number;
  mapH: number;
  tiles: Tile[];
  players: Player[];
  relations: RelationState[][];
  proposals: Proposal[];
  nextProposalId: number;
  units: Record<UnitId, Unit>;
  cities: Record<CityId, City>;
  visibility: number[][]; // [player][tileIndex] -> VIS_*
  nextUnitId: number;
  nextCityId: number;
  wondersBuilt: Record<string, CityId>; // wonderId -> the city that built it (global uniqueness)
  tradeRoutes: Record<number, TradeRoute>;
  nextTradeRouteId: number;
  religions: Record<string, ReligionState>;
  camps: { id: number; q: number; r: number }[];
  nextCampId: number;
  eventSeq: number;
  events: GameEvent[]; // bounded ring, audience-tagged
  winner: { player: PlayerId; victory: 'conquest' | 'score' | 'science' | 'culture' } | null;
}

/** Engine context: rules travel beside state so content is never imported by logic. */
export interface Ctx {
  rules: Ruleset;
}

export type Action =
  | { type: 'FOUND_CITY'; player: PlayerId; unit: UnitId }
  | { type: 'MOVE_UNIT'; player: PlayerId; unit: UnitId; path: Axial[] }
  | { type: 'ATTACK'; player: PlayerId; unit: UnitId; target: Axial }
  | { type: 'RANGED_ATTACK'; player: PlayerId; unit: UnitId; target: Axial }
  | { type: 'BUILD_IMPROVEMENT'; player: PlayerId; unit: UnitId; improvement: string }
  | { type: 'FORTIFY'; player: PlayerId; unit: UnitId }
  | { type: 'SKIP_UNIT'; player: PlayerId; unit: UnitId }
  | { type: 'DISBAND'; player: PlayerId; unit: UnitId }
  | { type: 'SET_PRODUCTION'; player: PlayerId; city: CityId; item: ProductionItem }
  | { type: 'SET_SPECIALISTS'; player: PlayerId; city: CityId; specialist: SpecialistType; count: number }
  | { type: 'BUY_ITEM'; player: PlayerId; city: CityId; item: ProductionItem }
  | { type: 'ESTABLISH_TRADE_ROUTE'; player: PlayerId; unit: UnitId; targetCity: CityId }
  | { type: 'SET_RESEARCH'; player: PlayerId; tech: string }
  | { type: 'DECLARE_WAR'; player: PlayerId; target: PlayerId }
  | { type: 'PROPOSE_DEAL'; player: PlayerId; to: PlayerId; give: DealItems; take: DealItems }
  | { type: 'RESPOND_DEAL'; player: PlayerId; proposal: number; accept: boolean }
  | { type: 'DENOUNCE'; player: PlayerId; target: PlayerId }
  | { type: 'FOUND_PANTHEON'; player: PlayerId; belief: string }
  | { type: 'FOUND_RELIGION'; player: PlayerId; name: string; holyCity: CityId; founderBelief: string; followerBelief: string }
  | { type: 'ADOPT_POLICY'; player: PlayerId; policy: string }
  | { type: 'CHOOSE_PROMOTION'; player: PlayerId; unit: UnitId; promotion: string }
  | { type: 'END_TURN'; player: PlayerId };

export type ActionType = Action['type'];

/** Sorted numeric keys of a Record — the only sanctioned way to iterate units/cities. */
export function sortedIds(rec: Record<number, unknown>): number[] {
  return Object.keys(rec)
    .map(Number)
    .sort((a, b) => a - b);
}
