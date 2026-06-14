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
  shrine: {
    id: 'shrine', name: 'Shrine', cost: 40, yields: { faith: 1 },
    art: { glyph: 'temple' },
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
    specialistSlots: { type: 'scientist', count: 1 },
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
    specialistSlots: { type: 'merchant', count: 1 },
    requiresTech: 'currency',
    art: { glyph: 'coin' },
  },
  temple: {
    id: 'temple',
    name: 'Temple',
    cost: 88,
    yields: { culture: 3, faith: 1 },
    specialistSlots: { type: 'artist', count: 1 },
    requiresTech: 'philosophy',
    art: { glyph: 'temple' },
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    cost: 112,
    yields: { production: 2 },
    specialistSlots: { type: 'engineer', count: 1 },
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
  colosseum: {
    id: 'colosseum', name: 'Colosseum', cost: 100, yields: {},
    happiness: 3, requiresTech: 'construction', art: { glyph: 'arch' },
  },
  courthouse: {
    id: 'courthouse', name: 'Courthouse', cost: 100, yields: {},
    pacifies: true, requiresTech: 'mathematics', art: { glyph: 'arch' },
  },
  university: {
    id: 'university', name: 'University', cost: 130, yields: { science: 3 },
    perPop: { yield: 'science', per: 2 }, specialistSlots: { type: 'scientist', count: 1 },
    requiresTech: 'education', art: { glyph: 'scroll' },
  },
  observatory: {
    id: 'observatory', name: 'Observatory', cost: 140, yields: { science: 3 },
    specialistSlots: { type: 'scientist', count: 1 },
    requiresTech: 'astronomy', art: { glyph: 'scroll' },
  },
  castle: {
    id: 'castle', name: 'Castle', cost: 110, yields: {}, defense: { strength: 10 },
    requiresTech: 'engineering', art: { glyph: 'wall' },
  },
  bank: {
    id: 'bank', name: 'Bank', cost: 130, yields: { gold: 4 }, specialistSlots: { type: 'merchant', count: 1 },
    requiresTech: 'banking', art: { glyph: 'coin' },
  },
  monastery: {
    id: 'monastery', name: 'Monastery', cost: 96, yields: { culture: 2, science: 1 },
    requiresTech: 'theology', art: { glyph: 'temple' },
  },
  cathedral: {
    id: 'cathedral', name: 'Cathedral', cost: 150, yields: { culture: 4 },
    requiresTech: 'architecture', art: { glyph: 'temple' },
  },
  pyramids: {
    id: 'pyramids', name: 'The Pyramids', cost: 180, yields: { production: 1 },
    wonder: true, effect: { kind: 'freeUnit', unit: 'worker', count: 2 },
    requiresTech: 'masonry', art: { glyph: 'palace' },
  },
  great_library: {
    id: 'great_library', name: 'The Great Library', cost: 200, yields: { science: 3 },
    wonder: true, effect: { kind: 'freeTech' }, requiresTech: 'writing', art: { glyph: 'scroll' },
  },
  hanging_gardens: {
    id: 'hanging_gardens', name: 'The Hanging Gardens', cost: 220, yields: { food: 2 },
    wonder: true, effect: { kind: 'empireYields', yields: { food: 1 } },
    requiresTech: 'mathematics', art: { glyph: 'amphora' },
  },
  great_wall: {
    id: 'great_wall', name: 'The Great Wall', cost: 300, yields: {},
    wonder: true, effect: { kind: 'cityDefense', strength: 6 },
    requiresTech: 'engineering', art: { glyph: 'wall' },
  },
  notre_dame: {
    id: 'notre_dame', name: 'Notre-Dame', cost: 320, yields: { culture: 3 },
    wonder: true, effect: { kind: 'cultureBurst', amount: 60 },
    requiresTech: 'theology', art: { glyph: 'temple' },
  },
  leonardos_workshop: {
    id: 'leonardos_workshop', name: "Leonardo's Workshop", cost: 420, yields: { production: 2 },
    wonder: true, effect: { kind: 'empireYields', yields: { production: 1, science: 1 } },
    requiresTech: 'printing_press', art: { glyph: 'hammer' },
  },
  sistine_chapel: {
    id: 'sistine_chapel', name: 'The Sistine Chapel', cost: 420, yields: { culture: 3 },
    wonder: true, effect: { kind: 'empireYields', yields: { culture: 1 } },
    requiresTech: 'architecture', art: { glyph: 'temple' },
  },
  circus_maximus: {
    id: 'circus_maximus', name: 'The Circus Maximus', cost: 250, yields: { culture: 1 },
    wonder: true, effect: { kind: 'happiness', amount: 5 },
    requiresTech: 'construction', art: { glyph: 'temple' },
  },
};
