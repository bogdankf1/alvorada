import type { AgendaDef } from '../types';

export const AGENDAS: Record<string, AgendaDef> = {
  conqueror:   { id: 'conqueror',   name: 'Conqueror',     blurb: 'Respects military strength.',          rule: 'likesStrongMilitary' },
  monumental:  { id: 'monumental',  name: 'Monument Builder', blurb: 'Admires great wonders.',            rule: 'likesWonderBuilders' },
  pacifist:    { id: 'pacifist',    name: 'Pacifist',      blurb: 'Despises warmongers.',                 rule: 'dislikesWarmongers' },
  aesthete:    { id: 'aesthete',    name: 'Aesthete',      blurb: 'Admires cultured peoples.',            rule: 'likesCultured' },
  devout:      { id: 'devout',      name: 'Devout',        blurb: 'Favors those who share the faith.',    rule: 'likesSharedReligion' },
  territorial: { id: 'territorial', name: 'Territorial',   blurb: 'Resents close neighbors.',             rule: 'dislikesNeighbors' },
  // extra hidden-pool variants: zealot and warlord intentionally reuse existing rules
  // (likesSharedReligion / likesStrongMilitary); differentiation is by name/tooltip only.
  zealot:      { id: 'zealot',      name: 'Zealot',        blurb: 'Demands shared faith.',                rule: 'likesSharedReligion' },
  warlord:     { id: 'warlord',     name: 'Warlord',       blurb: 'Honors only strength.',                rule: 'likesStrongMilitary' },
};
