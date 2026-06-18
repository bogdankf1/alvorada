import type { Ruleset, RulesetSettings, SpecialistType, SpecialistDef } from '../types';
import { TERRAINS, ELEVATIONS, FEATURES } from './terrain';
import { RESOURCES, IMPROVEMENTS } from './resources';
import { UNITS } from './units';
import { BUILDINGS } from './buildings';
import { TECHS, ERAS } from './techs';
import { CIVS } from './civs';
import { BELIEFS } from './beliefs';
import { POLICIES } from './policies';
import { PROMOTIONS } from './promotions';
import { TRAITS } from './traits';
import { AGENDAS } from './agendas';
import { EVENTS } from './events';
import { ROADS } from './roads';

const SETTINGS: RulesetSettings = {
  workRadius: 2,
  moveScale: 2,
  cityMinDist: 4,
  citySight: 2,
  cityBaseStrength: 6,
  cityStrengthPerPop: 1,
  cityMaxHp: 200,
  cityRegen: 15,
  cityCaptureHp: 50,
  capturePopLossQuarter: true,
  foodConsumptionPerPop: 2,
  sciencePerPopHalf: true,
  damageBase: 30,
  damagePerStrength: 2,
  damageMin: 8,
  damageMax: 64,
  fortifyBonus: 4,
  garrisonBonus: 4,
  healOwn: 10,
  healNeutral: 5,
  healCity: 20,
  purchaseMultiplier: 4,
  borderGrowth: { base: 10, linear: 8, quad: 2 },
  borderMaxRadius: 3,
  score: { city: 8, pop: 3, tech: 5, strengthPer: 20 },
  // turnLimit 260 + scoreThreshold 600: the longer arc + higher score bar let a tech
  // leader actually reach the science capstone (~turn 200-250) before the score/timeout
  // ending preempts it — so science is a reachable race, not a dead victory path.
  // culture.minTurn 220: raised from 150 so self-play breadth (200-turn) games reach the
  // medieval eras before a cultural victor can emerge.
  // culture.dominanceFactor 3 (tuned up from 2 via Phase-8 self-play): at 2, a cultural
  // hegemon out-influences every rival's lifetime culture by turn 220 (minTurn) and the
  // culture win pre-empts the deep renaissance science chain — seed 314's tech leader (Egypt,
  // scientific_method ~turn 244) lost the game to its own culture at turn 220. Requiring a
  // 3× margin pushes the culture win past the science capstone on tech-race seeds (314 now
  // ends 'science' @ ~221) while a genuine culture blowout still wins (seeds 999, 60221 end
  // 'culture' @ 220). At 4 the culture path becomes too rare (only the most extreme blowout
  // fires); 3 keeps both victory paths live and non-trivial across the seed sweep.
  victory: { scoreThreshold: 600, turnLimit: 260, scienceCapstone: 'scientific_method', culture: { dominanceFactor: 3, minTurn: 220, perWonder: 40 } },
  // Tuned via self-play telemetry. The brake still bites hard (empires routinely go
  // Unhappy/Very-Unhappy and build colosseums/courthouses) — but unhappyGrowthDivisor 3
  // (was 4) lets an Unhappy empire still grow its science core instead of stalling out,
  // so a trade-and-tech civ can reach the science capstone. Divisor 2 was too loose (it
  // bred sprawling empires permanently mired in Very-Unhappy); 3 keeps mid-game empires
  // at a healthy 4-6 cities. The base/perCity/perPop/luxury/veryUnhappyAt teeth are fixed.
  happiness: {
    baseEmpire: 9,
    perCity: 2,
    perPop: 1,
    freePopPerCity: 3,
    occupiedExtra: 3,
    luxuryHappiness: 4,
    unhappyGrowthDivisor: 3,
    veryUnhappyAt: -10,
    veryUnhappyProdPenaltyPct: 33,
  },
  // internationalScience 6 (was 2) is the key science enabler: trade science flows through
  // cityYields and bypasses the happiness growth/production brake, so a civ that trades hard
  // can out-tech the throttle and complete the renaissance chain. duration 40 + caravan cost
  // 40 keep routes plentiful and steady (fewer rebuilds) so the trade-science path is real.
  tradeRoute: {
    caravanRange: 12,
    duration: 40,
    domestic: { food: 1, production: 1 },
    international: { gold: 4 },
    internationalScience: 6,
    internationalScienceTech: 'guilds',
    destinationGold: 2,
    friendshipBonusPct: 50,
    pillageBounty: 25,
  },
  religion: { pantheonCost: 20, religionCost: 60, religionTech: 'theology', maxReligions: 4, spreadRange: 6, pressurePerCity: 2, holyCityBonus: 30, holyCityFaithDiv: 2 },
  combat: { xpPerAttack: 4, xpPerKill: 6, xpPerDefend: 3, xpVsBarbCap: 30, promotionThresholds: [10, 25, 45, 70, 100] },
  barbarians: { campCount: 6, startSafeRadius: 6, spawnRadius: 2, spawnEveryTurns: 6, maxNearCamp: 2, campBounty: 25 },
  tilePurchase: { baseCost: 50, costPerRing: 30, radius: 3 },
  naval: { embarkTech: 'bronze_working', embarkedDefense: 5 },
  startingUnits: ['settler', 'warrior'],
  diplomacy: {
    termLength: 30,
    goldPerTurnHorizon: 20,
    proposalTtl: 1,
    grudgeOnWar: 30,
    grudgeOnCapture: 20,
    grudgeOnDenounce: 10,
    grudgeOnBrokenDeal: 5,
    grudgeDecay: 2,
    attitude: {
      atWar: -60,
      grudgePerPoint: -1,
      denounced: -25,
      friendship: 40,
      borderFriction: -15,
      favorableDeal: 15,
      landCompetition: -10,
      strongerRival: -10,
      weakerRival: 5,
      agendaRespected: 12,
      agendaDefied: -15,
      sharedReligion: 8,
      scoreLeader: -8,
      admiredWonders: 6,
      competitionRange: 4,
    },
    bands: { friendly: 40, cordial: 15, neutral: -15, wary: -40 },
    acceptMargin: { hostile: 40, wary: 20, neutral: 8, cordial: 0, friendly: -10 },
    counterWindow: 30,
    minFriendBand: 'cordial',
    hiddenAgendaRevealTurns: 15,
  },
};

const SPECIALISTS: Record<SpecialistType, SpecialistDef> = {
  scientist: { name: 'Scientist', yields: { science: 3 } },
  merchant: { name: 'Merchant', yields: { gold: 3 } },
  artist: { name: 'Artist', yields: { culture: 3 } },
  engineer: { name: 'Engineer', yields: { production: 2 } },
};

export const STANDARD_RULESET: Ruleset = {
  id: 'standard',
  terrains: TERRAINS,
  elevations: ELEVATIONS,
  features: FEATURES,
  resources: RESOURCES,
  improvements: IMPROVEMENTS,
  roads: ROADS,
  units: UNITS,
  buildings: BUILDINGS,
  techs: TECHS,
  civs: CIVS,
  traits: TRAITS,
  agendas: AGENDAS,
  events: EVENTS,
  specialists: SPECIALISTS,
  beliefs: BELIEFS,
  policies: POLICIES,
  promotions: PROMOTIONS,
  eras: ERAS,
  settings: SETTINGS,
};
