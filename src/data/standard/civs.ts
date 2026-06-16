import type { CivDef } from '../types';

export const CIVS: Record<string, CivDef> = {
  rome: {
    id: 'rome',
    name: 'Rome',
    leader: 'Romulus',
    color: '#B03A3A',
    cityNames: ['Roma', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Arretium', 'Mediolanum', 'Arpinum', 'Capua', 'Ostia'],
    uniqueAbility: [{ kind: 'empireCivic', effect: { happiness: 3 } }],
    traits: ['warmonger', 'expansionist'], agenda: 'conqueror',
  },
  egypt: {
    id: 'egypt',
    name: 'Egypt',
    leader: 'Narmer',
    color: '#C2873E',
    cityNames: ['Thebes', 'Memphis', 'Heliopolis', 'Elephantine', 'Alexandria', 'Pi-Ramesses', 'Giza', 'Abydos', 'Edfu', 'Buto'],
    uniqueAbility: [{ kind: 'wonderProduction', amount: 3 }],
    traits: ['cultured', 'defensive'], agenda: 'monumental',
  },
  babylon: {
    id: 'babylon',
    name: 'Babylon',
    leader: 'Hammurabi',
    color: '#3A62B0',
    cityNames: ['Babylon', 'Akkad', 'Nippur', 'Dur-Kurigalzu', 'Borsippa', 'Sippar', 'Opis', 'Mari', 'Uruk', 'Kish'],
    uniqueAbility: [{ kind: 'empireCivic', effect: { yields: { science: 1 } } }],
    traits: ['scholarly', 'diplomatic'], agenda: 'pacifist',
  },
  hellas: {
    id: 'hellas',
    name: 'Hellas',
    leader: 'Pericles',
    color: '#2E8C83',
    cityNames: ['Athens', 'Sparta', 'Corinth', 'Argos', 'Knossos', 'Mycenae', 'Delphi', 'Eretria', 'Thebes-Boeotia', 'Rhodes'],
    uniqueAbility: [{ kind: 'empireCivic', effect: { yields: { culture: 1 } } }],
    traits: ['cultured', 'pious'], agenda: 'aesthete',
  },
  barbarians: { id: 'barbarians', name: 'Barbarians', leader: 'Barbarian Clans', color: '#8a4a3a', cityNames: ['Encampment'] },
};
