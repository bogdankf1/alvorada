import type { BeliefDef } from '../types';

export const BELIEFS: Record<string, BeliefDef> = {
  // pantheon (apply to the owner's every city)
  god_of_harvest: { id: 'god_of_harvest', name: 'God of the Harvest', kind: 'pantheon', effect: { yields: { food: 1 } } },
  god_of_craftsmen: { id: 'god_of_craftsmen', name: 'God of Craftsmen', kind: 'pantheon', effect: { yields: { production: 1 } } },
  god_of_commerce: { id: 'god_of_commerce', name: 'God of Commerce', kind: 'pantheon', effect: { yields: { gold: 1 } } },
  oral_tradition: { id: 'oral_tradition', name: 'Oral Tradition', kind: 'pantheon', effect: { yields: { science: 1 } } },
  goddess_of_festivals: { id: 'goddess_of_festivals', name: 'Goddess of Festivals', kind: 'pantheon', effect: { yields: { culture: 1 } } },
  stone_circles: { id: 'stone_circles', name: 'Stone Circles', kind: 'pantheon', effect: { perBuilding: { building: 'shrine', yields: { faith: 1 } } } },
  // founder (apply to the founder's every city)
  tithe: { id: 'tithe', name: 'Tithe', kind: 'founder', effect: { perBuilding: { building: 'temple', yields: { gold: 2 } } } },
  papal_primacy: { id: 'papal_primacy', name: 'Papal Primacy', kind: 'founder', effect: { happiness: 3 } },
  world_church: { id: 'world_church', name: 'World Church', kind: 'founder', effect: { yields: { culture: 1 } } },
  ceremonial_burial: { id: 'ceremonial_burial', name: 'Ceremonial Burial', kind: 'founder', effect: { yields: { faith: 1 } } },
  // follower (apply in each city that follows the religion)
  feed_the_world: { id: 'feed_the_world', name: 'Feed the World', kind: 'follower', effect: { yields: { food: 1 } } },
  religious_art: { id: 'religious_art', name: 'Religious Art', kind: 'follower', effect: { yields: { culture: 1 } } },
  cathedral_of_learning: { id: 'cathedral_of_learning', name: 'Cathedral of Learning', kind: 'follower', effect: { yields: { science: 1 } } },
  peace_gardens: { id: 'peace_gardens', name: 'Peace Gardens', kind: 'follower', effect: { happiness: 1 } },
};
