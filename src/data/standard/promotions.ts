import type { PromotionDef } from '../types';

export const PROMOTIONS: Record<string, PromotionDef> = {
  combat_i: { id: 'combat_i', name: 'Combat I', classes: ['melee', 'mounted', 'ranged', 'siege'], effect: { attackPct: 15, defensePct: 15 } },
  combat_ii: { id: 'combat_ii', name: 'Combat II', classes: ['melee', 'mounted', 'ranged', 'siege'], requires: ['combat_i'], effect: { attackPct: 15, defensePct: 15 } },
  shock: { id: 'shock', name: 'Shock', classes: ['melee'], effect: { vsClassPct: { class: 'melee', pct: 33 } } },
  formation: { id: 'formation', name: 'Formation', classes: ['melee', 'ranged'], effect: { vsClassPct: { class: 'mounted', pct: 33 } } },
  cover: { id: 'cover', name: 'Cover', classes: ['ranged', 'melee'], effect: { defensePct: 33 } },
  siege: { id: 'siege', name: 'Siege', classes: ['siege', 'melee'], effect: { vsCityPct: 50 } },
  accuracy: { id: 'accuracy', name: 'Accuracy', classes: ['ranged', 'siege'], effect: { attackPct: 33 } },
  mobility: { id: 'mobility', name: 'Mobility', classes: ['mounted', 'melee'], effect: { movement: 1 } },
  medic: { id: 'medic', name: 'Medic', effect: { healPerTurn: 10 } },
  march: { id: 'march', name: 'March', requires: ['medic'], effect: { healAlways: true } },
  commando: { id: 'commando', name: 'Commando', classes: ['melee', 'mounted'], effect: { ignoreZoc: true } },
};
