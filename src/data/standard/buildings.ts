import type { BuildingDef } from '../types';

export const BUILDINGS: Record<string, BuildingDef> = {
  palace: {
    id: 'palace',
    name: 'Palace',
    cost: 0,
    yields: { production: 2, science: 2, gold: 2, culture: 1 },
    defense: { strength: 2 },
    unbuildable: true, // granted to the capital, never produced
    art: { glyph: 'palace' },
  },
  monument: {
    id: 'monument',
    name: 'Monument',
    cost: 40,
    yields: { culture: 2 },
    art: { glyph: 'obelisk' },
  },
  granary: {
    id: 'granary',
    name: 'Granary',
    cost: 60,
    yields: { food: 2 },
    requiresTech: 'pottery',
    art: { glyph: 'amphora' },
  },
  library: {
    id: 'library',
    name: 'Library',
    cost: 72,
    yields: { science: 2 },
    perPop: { yield: 'science', per: 2 },
    requiresTech: 'writing',
    art: { glyph: 'scroll' },
  },
  walls: {
    id: 'walls',
    name: 'Walls',
    cost: 72,
    yields: {},
    defense: { strength: 6 },
    requiresTech: 'masonry',
    art: { glyph: 'wall' },
  },
  market: {
    id: 'market',
    name: 'Market',
    cost: 96,
    yields: { gold: 3 },
    requiresTech: 'currency',
    art: { glyph: 'coin' },
  },
  temple: {
    id: 'temple',
    name: 'Temple',
    cost: 88,
    yields: { culture: 3 },
    requiresTech: 'philosophy',
    art: { glyph: 'temple' },
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    cost: 112,
    yields: { production: 2 },
    requiresTech: 'construction',
    art: { glyph: 'hammer' },
  },
  aqueduct: {
    id: 'aqueduct',
    name: 'Aqueduct',
    cost: 104,
    yields: { food: 3 },
    requiresTech: 'construction',
    art: { glyph: 'arch' },
  },
  university: {
    id: 'university', name: 'University', cost: 130, yields: { science: 2 },
    perPop: { yield: 'science', per: 2 }, requiresTech: 'education', art: { glyph: 'scroll' },
  },
  observatory: {
    id: 'observatory', name: 'Observatory', cost: 140, yields: { science: 3 },
    requiresTech: 'astronomy', art: { glyph: 'scroll' },
  },
  castle: {
    id: 'castle', name: 'Castle', cost: 110, yields: {}, defense: { strength: 8 },
    requiresTech: 'engineering', art: { glyph: 'wall' },
  },
  bank: {
    id: 'bank', name: 'Bank', cost: 130, yields: { gold: 4 }, requiresTech: 'banking',
    art: { glyph: 'coin' },
  },
  monastery: {
    id: 'monastery', name: 'Monastery', cost: 96, yields: { culture: 2, science: 1 },
    requiresTech: 'theology', art: { glyph: 'temple' },
  },
  cathedral: {
    id: 'cathedral', name: 'Cathedral', cost: 150, yields: { culture: 4 },
    requiresTech: 'architecture', art: { glyph: 'temple' },
  },
};
