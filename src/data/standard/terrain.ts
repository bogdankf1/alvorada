import type { TerrainDef, ElevationDef, FeatureDef } from '../types';

/** Base terrains. Art fills come from DESIGN.md's terrain palette. */
export const TERRAINS: Record<string, TerrainDef> = {
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    water: true,
    yields: { food: 1 },
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#1E4E73', accent: '#16405F' },
  },
  coast: {
    id: 'coast',
    name: 'Coast',
    water: true,
    yields: { food: 1, gold: 1 },
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#2E6E94', accent: '#9CC4D4' },
  },
  grassland: {
    id: 'grassland',
    name: 'Grassland',
    yields: { food: 2 },
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#6B8F3E', accent: '#7DA34C' },
  },
  plains: {
    id: 'plains',
    name: 'Plains',
    yields: { food: 1, production: 1 },
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#B5A35C', accent: '#C4B26B' },
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    yields: {},
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#D8BD7F', accent: '#C3A35F' },
  },
  tundra: {
    id: 'tundra',
    name: 'Tundra',
    yields: { food: 1 },
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#9AA08B', accent: '#B9BCAB' },
  },
  snow: {
    id: 'snow',
    name: 'Snow',
    yields: {},
    moveCost: 1,
    defenseBonus: 0,
    art: { fill: '#E8EDF0', accent: '#C9D4DC' },
  },
};

export const ELEVATIONS: Record<string, ElevationDef> = {
  flat: { id: 'flat', name: 'Flat', yields: {}, moveCostDelta: 0, defenseBonus: 0 },
  hill: {
    id: 'hill',
    name: 'Hills',
    yields: { production: 1 },
    moveCostDelta: 1,
    defenseBonus: 3,
    sightBonus: 1,
  },
  mountain: {
    id: 'mountain',
    name: 'Mountain',
    yields: {},
    moveCostDelta: 0,
    defenseBonus: 0,
    impassable: true,
  },
};

export const FEATURES: Record<string, FeatureDef> = {
  forest: {
    id: 'forest',
    name: 'Forest',
    yields: { production: 1 },
    moveCostDelta: 1,
    defenseBonus: 3,
    removable: true,
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    yields: { food: 1 },
    moveCostDelta: 1,
    defenseBonus: 3,
    removable: true,
  },
  oasis: {
    id: 'oasis',
    name: 'Oasis',
    yields: { food: 3, gold: 1 },
    moveCostDelta: 0,
    defenseBonus: 0,
  },
};
