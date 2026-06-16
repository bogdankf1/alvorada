import type { EventDef } from '../types';

export const EVENTS: Record<string, EventDef> = {
  bountiful_harvest: { id: 'bountiful_harvest', title: 'Bountiful Harvest', body: 'The fields yield more than anyone can remember.', minTurn: 4, requiresPop: 2,
    choices: [{ text: 'Give thanks', effects: [{ k: 'culture', n: 8 }] }] },
  good_omen: { id: 'good_omen', title: 'An Omen in the Sky', body: 'The priests read fortune in the heavens.', minTurn: 4,
    choices: [{ text: 'Take heart', effects: [{ k: 'faith', n: 10 }] }] },
  bumper_trade: { id: 'bumper_trade', title: 'Caravans of Plenty', body: 'Foreign traders bring a windfall of coin.', minTurn: 8,
    choices: [{ text: 'Fill the coffers', effects: [{ k: 'gold', n: 25 }] }] },
  plague: { id: 'plague', title: 'A Wasting Sickness', body: 'Fever sweeps the crowded streets.', minTurn: 30, requiresPop: 5,
    choices: [{ text: 'Endure it', effects: [{ k: 'popChange', n: -1 }] }] },
  explorers_return: { id: 'explorers_return', title: 'Wanderers Return', body: 'Travelers bring maps of distant country.', minTurn: 6,
    choices: [{ text: 'Hear their tales', effects: [{ k: 'reveal', radius: 4 }] }] },
  migrants: { id: 'migrants', title: 'Migrants at the Gate', body: 'Families seek refuge within your walls.', minTurn: 15,
    choices: [
      { text: 'Welcome them', effects: [{ k: 'popChange', n: 1 }], aiBias: 4 },
      { text: 'Send them on with alms', effects: [{ k: 'gold', n: 25 }] },
    ] },
  mineral_strike: { id: 'mineral_strike', title: 'A Rich Seam', body: 'Miners strike a vein in the hills.', minTurn: 10,
    choices: [
      { text: 'Invest in the works', effects: [{ k: 'production', n: 15 }] },
      { text: 'Sell the rights', effects: [{ k: 'gold', n: 40 }] },
    ] },
  wandering_scholar: { id: 'wandering_scholar', title: 'A Wandering Scholar', body: 'A learned traveler offers to stay.', minTurn: 18,
    choices: [
      { text: 'Host them at court', effects: [{ k: 'science', n: 25 }], aiBias: 3 },
      { text: 'Send them away', effects: [] },
    ] },
  festival: { id: 'festival', title: 'Call for a Festival', body: 'The people long to celebrate.', minTurn: 12, requiresPop: 4,
    choices: [
      { text: 'Spare no expense', effects: [{ k: 'culture', n: 18 }, { k: 'gold', n: -20 }] },
      { text: 'A modest affair', effects: [{ k: 'culture', n: 5 }] },
    ] },
  pilgrims: { id: 'pilgrims', title: 'Pilgrims Arrive', body: 'The faithful gather at your temples.', minTurn: 15,
    choices: [
      { text: 'Bless them', effects: [{ k: 'faith', n: 20 }], aiBias: 2 },
      { text: 'Levy a toll', effects: [{ k: 'gold', n: 25 }] },
    ] },
  volunteer_militia: { id: 'volunteer_militia', title: 'Volunteers Muster', body: 'Young men clamor to take up arms.', minTurn: 20,
    choices: [
      { text: 'Arm them', effects: [{ k: 'unit', unit: 'warrior' }] },
      { text: 'Send them home with coin', effects: [{ k: 'gold', n: 20 }] },
    ] },
  ancient_ruins: { id: 'ancient_ruins', title: 'Ruins of the Ancients', body: 'Explorers uncover a forgotten city.', minTurn: 8, oncePerGame: true,
    choices: [
      { text: 'Study the relics', effects: [{ k: 'science', n: 30 }], aiBias: 3 },
      { text: 'Strip them for gold', effects: [{ k: 'gold', n: 40 }] },
    ] },
};
