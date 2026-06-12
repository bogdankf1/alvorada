import type { TechDef, EraDef } from '../types';

export const ERAS: EraDef[] = [
  { id: 'ancient', name: 'Ancient Era' },
  { id: 'classical', name: 'Classical Era' },
];

/**
 * What a tech unlocks is never written here — units/buildings/improvements/resources
 * point at techs via requiresTech/revealedBy, and the UI/AI derive the reverse map.
 * Adding content never edits the tree. `pos` lays out the tech panel.
 */
export const TECHS: Record<string, TechDef> = {
  agriculture: {
    id: 'agriculture',
    name: 'Agriculture',
    era: 'ancient',
    cost: 20,
    prereqs: [],
    pos: { col: 0, row: 2 },
  },
  pottery: {
    id: 'pottery',
    name: 'Pottery',
    era: 'ancient',
    cost: 28,
    prereqs: ['agriculture'],
    pos: { col: 1, row: 0 },
  },
  animal_husbandry: {
    id: 'animal_husbandry',
    name: 'Animal Husbandry',
    era: 'ancient',
    cost: 28,
    prereqs: ['agriculture'],
    pos: { col: 1, row: 2 },
  },
  archery: {
    id: 'archery',
    name: 'Archery',
    era: 'ancient',
    cost: 28,
    prereqs: ['agriculture'],
    pos: { col: 1, row: 3 },
  },
  mining: {
    id: 'mining',
    name: 'Mining',
    era: 'ancient',
    cost: 28,
    prereqs: ['agriculture'],
    pos: { col: 1, row: 4 },
  },
  writing: {
    id: 'writing',
    name: 'Writing',
    era: 'ancient',
    cost: 48,
    prereqs: ['pottery'],
    pos: { col: 2, row: 0 },
  },
  masonry: {
    id: 'masonry',
    name: 'Masonry',
    era: 'ancient',
    cost: 48,
    prereqs: ['mining'],
    pos: { col: 2, row: 3 },
  },
  bronze_working: {
    id: 'bronze_working',
    name: 'Bronze Working',
    era: 'ancient',
    cost: 48,
    prereqs: ['mining'],
    pos: { col: 2, row: 4 },
  },
  currency: {
    id: 'currency',
    name: 'Currency',
    era: 'classical',
    cost: 85,
    prereqs: ['writing'],
    pos: { col: 3, row: 0 },
  },
  philosophy: {
    id: 'philosophy',
    name: 'Philosophy',
    era: 'classical',
    cost: 85,
    prereqs: ['writing'],
    pos: { col: 3, row: 1 },
  },
  horseback_riding: {
    id: 'horseback_riding',
    name: 'Horseback Riding',
    era: 'classical',
    cost: 85,
    prereqs: ['animal_husbandry'],
    pos: { col: 3, row: 2 },
  },
  iron_working: {
    id: 'iron_working',
    name: 'Iron Working',
    era: 'classical',
    cost: 85,
    prereqs: ['bronze_working'],
    pos: { col: 3, row: 4 },
  },
  mathematics: {
    id: 'mathematics',
    name: 'Mathematics',
    era: 'classical',
    cost: 120,
    prereqs: ['currency'],
    pos: { col: 4, row: 0 },
  },
  construction: {
    id: 'construction',
    name: 'Construction',
    era: 'classical',
    cost: 120,
    prereqs: ['masonry'],
    pos: { col: 4, row: 3 },
  },
};
