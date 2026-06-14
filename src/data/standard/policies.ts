import type { PolicyDef } from '../types';

export const POLICIES: Record<string, PolicyDef> = {
  aristocracy: { id: 'aristocracy', name: 'Aristocracy', branch: 'Tradition', cost: 50, prereqs: [], effect: { yields: { culture: 1 } } },
  monarchy: { id: 'monarchy', name: 'Monarchy', branch: 'Tradition', cost: 80, prereqs: ['aristocracy'], effect: { happiness: 2 } },
  landed_elite: { id: 'landed_elite', name: 'Landed Elite', branch: 'Tradition', cost: 80, prereqs: ['aristocracy'], effect: { yields: { food: 1 } } },
  citizenship: { id: 'citizenship', name: 'Citizenship', branch: 'Liberty', cost: 50, prereqs: [], effect: { yields: { production: 1 } } },
  republic: { id: 'republic', name: 'Republic', branch: 'Liberty', cost: 80, prereqs: ['citizenship'], effect: { yields: { gold: 1 } } },
  meritocracy: { id: 'meritocracy', name: 'Meritocracy', branch: 'Liberty', cost: 80, prereqs: ['citizenship'], effect: { happiness: 2 } },
  organized_religion: { id: 'organized_religion', name: 'Organized Religion', branch: 'Piety', cost: 50, prereqs: [], effect: { yields: { faith: 1 } } },
  theocracy: { id: 'theocracy', name: 'Theocracy', branch: 'Piety', cost: 80, prereqs: ['organized_religion'], effect: { influenceMult: 25 } },
  free_thought: { id: 'free_thought', name: 'Free Thought', branch: 'Piety', cost: 80, prereqs: ['organized_religion'], effect: { yields: { science: 1 } } },
};
