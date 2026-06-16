/**
 * The pure, data-driven diplomacy model: how a player feels about another
 * (attitude) and what a proposed deal is worth to its recipient (valueDeal),
 * plus the deterministic accept/reject/counter resolution. Shared by the AI
 * decision layer and the UI verdict line so they never disagree. Integer math
 * only — same inputs, same answer, on every platform.
 */
import type { AttitudeBand } from '../data/types';
import type { Ctx, GameState, PlayerId, DealItems, Proposal } from './types';
import { hexDistance, tileIndex, neighbors, axialOfIndex } from './hex';
import { computeScore, militaryPower, playerCities, tileOwner, wonderCount, commonReligion } from './selectors';

export interface AttitudeFactor {
  label: string;
  delta: number;
}
export interface Attitude {
  score: number;
  band: AttitudeBand;
  factors: AttitudeFactor[];
}

// Deal-token valuation constants. Not in ruleset settings for v1 (the spec didn't
// enumerate them); kept here, named, so they read clearly and are trivial to promote
// to data later. The attitude weights/bands/margins ARE data — see DiplomacySettings.
const OPEN_BORDERS_COST: Record<AttitudeBand, number> = {
  hostile: 400, // effectively a refusal: you don't let enemies march through
  wary: 120,
  neutral: 40,
  cordial: 15,
  friendly: 15,
};
const OPEN_BORDERS_RECEIVED = 20; // gaining passage into their land: minor convenience
const PEACE_BASE_VALUE = 20; // baseline worth of ending a war, before how-the-war-goes
const FRIENDSHIP_VALUE = 30; // worth of a friendship the player is willing to enter
const FRIENDSHIP_GATE_PENALTY = -1000; // below the trust bar: won't befriend at any price

const BAND_ORDER: AttitudeBand[] = ['hostile', 'wary', 'neutral', 'cordial', 'friendly'];

/** Ordinal of an attitude band (hostile=0 … friendly=4); the one place the order lives. */
export function bandRank(band: AttitudeBand): number {
  return BAND_ORDER.indexOf(band);
}

// Whether any two owned territories are adjacent. Scans tiles (~hundreds–1300 at game
// scale) — microseconds, and this is the engine layer (no render loop).
function territoriesTouch(state: GameState, a: PlayerId, b: PlayerId): boolean {
  for (let i = 0; i < state.tiles.length; i++) {
    if (tileOwner(state, i) !== a) continue;
    for (const nb of neighbors(axialOfIndex(i, state.mapW))) {
      const j = tileIndex(nb, state.mapW, state.mapH);
      if (j >= 0 && tileOwner(state, j) === b) return true;
    }
  }
  return false;
}

/** True when any city of `a` sits within `range` of any city of `b`. */
function cityWithin(state: GameState, a: PlayerId, b: PlayerId, range: number): boolean {
  const bCities = playerCities(state, b);
  for (const ca of playerCities(state, a)) {
    for (const cb of bCities) {
      if (hexDistance({ q: ca.q, r: ca.r }, { q: cb.q, r: cb.r }) <= range) return true;
    }
  }
  return false;
}

function bandOf(ctx: Ctx, score: number): AttitudeBand {
  const b = ctx.rules.settings.diplomacy.bands;
  if (score >= b.friendly) return 'friendly';
  if (score >= b.cordial) return 'cordial';
  if (score >= b.neutral) return 'neutral';
  if (score >= b.wary) return 'wary';
  return 'hostile';
}

/** One agenda's verdict on `toward`, from `subject`'s view. Relative comparisons — no magic numbers. */
function agendaFactor(
  ctx: Ctx, state: GameState, subject: PlayerId, toward: PlayerId, agendaId: string | undefined,
): AttitudeFactor | null {
  if (!agendaId) return null;
  const ag = ctx.rules.agendas[agendaId];
  if (!ag) return null;
  const w = ctx.rules.settings.diplomacy.attitude;
  const yes = (why: string, delta: number): AttitudeFactor => ({ label: `${ag.name}: ${why}`, delta });
  switch (ag.rule) {
    case 'likesWonderBuilders':
      return wonderCount(state, toward) > wonderCount(state, subject) ? yes('admires their wonders', w.agendaRespected) : null;
    case 'dislikesWarmongers':
      return state.players.some((p) => p.alive && p.id !== toward && state.relations[toward][p.id]?.status === 'war')
        ? yes('abhors their warmongering', w.agendaDefied) : null;
    case 'likesStrongMilitary':
      return militaryPower(ctx, state, toward) >= militaryPower(ctx, state, subject) ? yes('respects their strength', w.agendaRespected) : null;
    case 'likesCultured':
      return state.players[toward].cultureTotal > state.players[subject].cultureTotal ? yes('admires their culture', w.agendaRespected) : null;
    case 'likesSharedReligion':
      return commonReligion(state, subject, toward) ? yes('shares the true faith', w.agendaRespected) : null;
    case 'dislikesNeighbors':
      return territoriesTouch(state, subject, toward) ? yes('resents the shared border', w.agendaDefied) : null;
  }
}

/** How `subject` feels about `toward`, with a reasoned factor breakdown. */
export function attitude(ctx: Ctx, state: GameState, subject: PlayerId, toward: PlayerId): Attitude {
  const d = ctx.rules.settings.diplomacy.attitude;
  const rel = state.relations[subject][toward];
  const back = state.relations[toward][subject];
  const factors: AttitudeFactor[] = [];
  const add = (label: string, delta: number) => {
    if (delta !== 0) factors.push({ label, delta });
  };

  if (rel.status === 'war') add('At war', d.atWar);
  if (rel.grudge > 0) add('Recent aggression', d.grudgePerPoint * rel.grudge);
  if (rel.denounced || back.denounced) add('Denouncement', d.denounced);
  if (rel.friends) add('Declared friendship', d.friendship);
  if (territoriesTouch(state, subject, toward)) add('Bordering territory', d.borderFriction);
  if (back.goldPerTurn > 0 || (back.openBordersUntil > 0 && back.openBordersUntil >= state.turn))
    add('Favorable dealings', d.favorableDeal);
  if (cityWithin(state, toward, subject, d.competitionRange)) add('Crowding our lands', d.landCompetition);

  const myPower = militaryPower(ctx, state, subject);
  const theirPower = militaryPower(ctx, state, toward);
  if (theirPower > myPower * 1.5) add('Stronger than us', d.strongerRival);
  else if (myPower > theirPower * 1.5) add('Weaker than us', d.weakerRival);

  // agendas: the subject's historical + hidden agenda judge `toward`
  const civAgenda = ctx.rules.civs[state.players[subject].civ]?.agenda;
  const af1 = agendaFactor(ctx, state, subject, toward, civAgenda);
  if (af1) add(af1.label, af1.delta);
  const hidden = state.players[subject].hiddenAgenda;
  if (hidden && hidden !== civAgenda) {
    const af2 = agendaFactor(ctx, state, subject, toward, hidden);
    if (af2) add(af2.label, af2.delta);
  }
  // universal reactivity (every leader feels these a little)
  if (commonReligion(state, subject, toward)) add('Shared faith', d.sharedReligion);
  if (wonderCount(state, toward) > wonderCount(state, subject)) add('Awed by their wonders', d.admiredWonders);
  if (computeScore(ctx, state, toward) > computeScore(ctx, state, subject) * 1.3) add('Overshadowing us', d.scoreLeader);

  const score = factors.reduce((s, f) => s + f.delta, 0);
  return { score, band: bandOf(ctx, score), factors };
}

/** What `viewer` knows of `rival`'s agendas: historical once met, hidden after the reveal delay. */
export function agendaKnown(ctx: Ctx, state: GameState, viewer: PlayerId, rival: PlayerId): { historical: boolean; hidden: boolean } {
  const rel = state.relations[viewer][rival];
  const met = rel.met;
  const since = rel.firstContactTurn ?? state.turn;
  const hidden = met && state.turn - since >= ctx.rules.settings.diplomacy.hiddenAgendaRevealTurns;
  return { historical: met, hidden };
}

function sideValue(
  ctx: Ctx,
  state: GameState,
  owner: PlayerId,
  counterparty: PlayerId,
  items: DealItems,
  asReceiver: boolean,
): number {
  const d = ctx.rules.settings.diplomacy;
  let v = 0;
  v += items.gold; // face value
  if (items.goldPerTurn) v += items.goldPerTurn.amount * Math.min(items.goldPerTurn.turns, d.goldPerTurnHorizon);
  if (items.openBorders) {
    // gaining passage is a minor convenience; granting it costs more the less you trust them
    v += asReceiver ? OPEN_BORDERS_RECEIVED : OPEN_BORDERS_COST[attitude(ctx, state, owner, counterparty).band];
  }
  if (items.peace) {
    // only meaningful at war; worth more to whoever is faring worse
    const mine = militaryPower(ctx, state, owner);
    const theirs = militaryPower(ctx, state, counterparty);
    v += Math.max(0, Math.floor((theirs - mine) / 2) + PEACE_BASE_VALUE);
  }
  if (items.friendship) {
    const band = attitude(ctx, state, owner, counterparty).band;
    v += bandRank(band) >= bandRank(d.minFriendBand) ? FRIENDSHIP_VALUE : FRIENDSHIP_GATE_PENALTY;
  }
  return v;
}

/** Net worth of a proposal to `recipient` = value(received) − value(given). */
export function valueDeal(ctx: Ctx, state: GameState, recipient: PlayerId, p: Proposal): number {
  const counterparty = recipient === p.to ? p.from : p.to;
  const received = recipient === p.to ? p.give : p.take;
  const given = recipient === p.to ? p.take : p.give;
  return (
    sideValue(ctx, state, recipient, counterparty, received, true) -
    sideValue(ctx, state, recipient, counterparty, given, false)
  );
}

export type Resolution =
  | { kind: 'accept' }
  | { kind: 'reject' }
  | { kind: 'counter'; give: DealItems; take: DealItems };

/** Decide how `p`'s recipient answers. `allowCounter` only when the proposer can respond (human). */
export function resolveProposal(ctx: Ctx, state: GameState, p: Proposal, allowCounter: boolean): Resolution {
  const d = ctx.rules.settings.diplomacy;
  const recipient = p.to;
  const band = attitude(ctx, state, recipient, p.from).band;
  const margin = d.acceptMargin[band];
  const net = valueDeal(ctx, state, recipient, p);
  if (net >= margin) return { kind: 'accept' };
  if (allowCounter && net >= margin - d.counterWindow) {
    const gap = margin - net; // demand the shortfall as extra lump gold from the proposer
    if (gap <= state.players[p.from].gold - p.take.gold) {
      return { kind: 'counter', give: { ...p.give }, take: { ...p.take, gold: p.take.gold + gap } };
    }
  }
  return { kind: 'reject' };
}
