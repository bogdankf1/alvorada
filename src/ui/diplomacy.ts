/**
 * UI-side diplomacy helpers. The verdict line calls the SAME engine valuation
 * the AI uses, so what the council predicts is exactly what the AI will do.
 */
import type { AttitudeBand } from '../data/types';
import type { DealItems, GameState, PlayerId } from '../engine/types';
import { gameCtx } from '../app/driver';
import { attitude, valueDeal } from '../engine/diplomacy-eval';

export interface DraftDeal {
  give: DealItems; // what the viewing player provides (viewer → rival)
  take: DealItems; // what the viewing player asks (rival → viewer)
}
export const emptyDraft = (): DraftDeal => ({ give: { gold: 0 }, take: { gold: 0 } });

export const ATTITUDE_COLOR: Record<AttitudeBand, string> = {
  hostile: '#C25B4A',
  wary: '#D08B4C',
  neutral: '#B9B09A',
  cordial: '#9CC069',
  friendly: '#7FB6D9',
};
export const ATTITUDE_LABEL: Record<AttitudeBand, string> = {
  hostile: 'Hostile',
  wary: 'Wary',
  neutral: 'Neutral',
  cordial: 'Cordial',
  friendly: 'Friendly',
};

export type VerdictTone = 'accept' | 'counter' | 'reject';

export function dealVerdict(
  game: GameState,
  viewer: PlayerId,
  rival: PlayerId,
  draft: DraftDeal,
): { tone: VerdictTone; text: string } {
  const d = gameCtx.rules.settings.diplomacy;
  const proposal = { id: -1, from: viewer, to: rival, give: draft.give, take: draft.take, expiresTurn: 0 };
  const band = attitude(gameCtx, game, rival, viewer).band;
  const margin = d.acceptMargin[band];
  const net = valueDeal(gameCtx, game, rival, proposal);
  if (net >= margin) return { tone: 'accept', text: 'They would accept this.' };
  if (net >= margin - d.counterWindow) return { tone: 'counter', text: 'They want more — they may counter.' };
  return { tone: 'reject', text: 'They would refuse this.' };
}
