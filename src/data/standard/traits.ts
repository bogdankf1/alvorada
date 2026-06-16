import type { TraitDef } from '../types';

export const TRAITS: Record<string, TraitDef> = {
  warmonger:    { id: 'warmonger',    name: 'Warmonger',    blurb: 'Quick to war; builds armies.',        weights: { warThreshold: -0.2, warTurnGate: -10, military: 2 } },
  expansionist: { id: 'expansionist', name: 'Expansionist', blurb: 'Settles widely and early.',            weights: { expansion: 1 } },
  pious:        { id: 'pious',        name: 'Pious',        blurb: 'Prizes faith and religion.',           weights: { faith: 2 } },
  scholarly:    { id: 'scholarly',    name: 'Scholarly',    blurb: 'Pursues science.',                     weights: { science: 2 } },
  cultured:     { id: 'cultured',     name: 'Cultured',     blurb: 'Builds wonders and culture.',          weights: { culture: 2 } },
  mercantile:   { id: 'mercantile',   name: 'Mercantile',   blurb: 'Chases gold and trade.',               weights: { gold: 2 } },
  defensive:    { id: 'defensive',    name: 'Defensive',    blurb: 'Slow to war; holds its ground.',        weights: { warThreshold: 0.2, warTurnGate: 15 } },
  diplomatic:   { id: 'diplomatic',   name: 'Diplomatic',   blurb: 'Seeks friends.',                        weights: { dealWillingness: 1 } },
};
