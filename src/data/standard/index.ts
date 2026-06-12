import type { Ruleset, RulesetSettings } from '../types';
import { TERRAINS, ELEVATIONS, FEATURES } from './terrain';
import { RESOURCES, IMPROVEMENTS } from './resources';
import { UNITS } from './units';
import { BUILDINGS } from './buildings';
import { TECHS, ERAS } from './techs';
import { CIVS } from './civs';

const SETTINGS: RulesetSettings = {
  workRadius: 2,
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
  victory: { scoreThreshold: 350, turnLimit: 200 },
  startingUnits: ['settler', 'warrior'],
};

export const STANDARD_RULESET: Ruleset = {
  id: 'standard',
  terrains: TERRAINS,
  elevations: ELEVATIONS,
  features: FEATURES,
  resources: RESOURCES,
  improvements: IMPROVEMENTS,
  units: UNITS,
  buildings: BUILDINGS,
  techs: TECHS,
  civs: CIVS,
  eras: ERAS,
  settings: SETTINGS,
};
