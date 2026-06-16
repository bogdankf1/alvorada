/**
 * Engine-side diplomacy mutations: apply an accepted deal, enter war, denounce,
 * queue a proposal, and process per-turn obligations. Called by the reducer and
 * the turn loop. All operate on the (Immer draft) GameState in place.
 */
import type { Ctx, GameState, PlayerId, DealItems, Proposal } from '../types';
import { pushEvent } from '../events';
import { cancelInternationalRoutesBetween } from './trade';
import { attitude, bandRank } from '../diplomacy-eval';

export function cancelPacts(state: GameState, a: PlayerId, b: PlayerId): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = state.relations[x][y];
    r.openBordersUntil = 0;
    r.goldPerTurn = 0;
    r.goldUntil = 0;
  }
}

export function enterWar(ctx: Ctx, state: GameState, a: PlayerId, b: PlayerId): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const r = state.relations[x][y];
    r.status = 'war';
    r.since = state.turn;
    r.friends = false;
  }
  cancelPacts(state, a, b);
  cancelInternationalRoutesBetween(state, a, b);
  state.relations[b][a].grudge += ctx.rules.settings.diplomacy.grudgeOnWar;
  state.proposals = state.proposals.filter(
    (p) => !((p.from === a && p.to === b) || (p.from === b && p.to === a)),
  );
}

export function applyDeal(
  ctx: Ctx,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: DealItems,
  take: DealItems,
): void {
  const term = ctx.rules.settings.diplomacy.termLength;
  if (give.peace && take.peace) {
    for (const [x, y] of [[from, to], [to, from]] as const) {
      state.relations[x][y].status = 'peace';
      state.relations[x][y].since = state.turn;
    }
    cancelPacts(state, from, to);
  }
  if (give.friendship && take.friendship) {
    state.relations[from][to].friends = true;
    state.relations[to][from].friends = true;
  }
  if (give.gold > 0) {
    state.players[from].gold -= give.gold;
    state.players[to].gold += give.gold;
  }
  if (take.gold > 0) {
    state.players[to].gold -= take.gold;
    state.players[from].gold += take.gold;
  }
  if (give.goldPerTurn) {
    const r = state.relations[from][to];
    r.goldPerTurn = give.goldPerTurn.amount;
    r.goldUntil = state.turn + give.goldPerTurn.turns;
  }
  if (take.goldPerTurn) {
    const r = state.relations[to][from];
    r.goldPerTurn = take.goldPerTurn.amount;
    r.goldUntil = state.turn + take.goldPerTurn.turns;
  }
  if (give.openBorders) state.relations[from][to].openBordersUntil = state.turn + term;
  if (take.openBorders) state.relations[to][from].openBordersUntil = state.turn + term;
}

export function applyDenounce(ctx: Ctx, state: GameState, from: PlayerId, to: PlayerId): void {
  state.relations[from][to].denounced = true;
  if (state.relations[from][to].friends) {
    state.relations[from][to].friends = false;
    state.relations[to][from].friends = false;
  }
  state.relations[to][from].grudge += ctx.rules.settings.diplomacy.grudgeOnDenounce;
  pushEvent(state, {
    player: null,
    type: 'denounce',
    msg: `${state.players[from].name} denounces ${state.players[to].name}`,
  });
}

export function pushProposal(
  ctx: Ctx,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: DealItems,
  take: DealItems,
): Proposal {
  const p: Proposal = {
    id: state.nextProposalId++,
    from,
    to,
    give,
    take,
    expiresTurn: state.turn + ctx.rules.settings.diplomacy.proposalTtl,
  };
  state.proposals.push(p);
  return p;
}

/** Turn-start processing for player p: pay/expire gold-per-turn, expire borders & stale proposals, decay grudges. */
export function processObligations(ctx: Ctx, state: GameState, p: PlayerId): void {
  const decay = ctx.rules.settings.diplomacy.grudgeDecay;
  for (const o of state.players) {
    if (o.id === p || !o.alive) continue; // skip self and the fallen
    const out = state.relations[p][o.id];
    if (out.goldPerTurn > 0) {
      if (state.turn > out.goldUntil) {
        out.goldPerTurn = 0;
        out.goldUntil = 0;
      } else if (state.players[p].gold >= out.goldPerTurn) {
        state.players[p].gold -= out.goldPerTurn;
        state.players[o.id].gold += out.goldPerTurn;
      } else {
        out.goldPerTurn = 0;
        out.goldUntil = 0;
        state.relations[o.id][p].grudge += ctx.rules.settings.diplomacy.grudgeOnBrokenDeal;
        pushEvent(state, { player: o.id, type: 'dealBroken', msg: `${state.players[p].name} failed to pay tribute owed to you` });
        pushEvent(state, { player: p, type: 'dealBroken', msg: `You could not pay tribute owed to ${state.players[o.id].name}` });
      }
    }
    if (out.openBordersUntil > 0 && state.turn > out.openBordersUntil) out.openBordersUntil = 0;
    if (out.grudge > 0) out.grudge = Math.max(0, out.grudge - decay);
    // reactivity: surface when p's feelings toward a met rival cross a dramatic threshold
    if (out.met && !state.players[o.id].barbarian) {
      const band = attitude(ctx, state, p, o.id).band;
      const prev = out.lastBand;
      if (prev && prev !== band) {
        const worsened = bandRank(band) < bandRank(prev);
        const dramatic = band === 'wary' || band === 'hostile' || band === 'friendly';
        if (dramatic && (worsened || band === 'friendly')) {
          pushEvent(state, {
            player: o.id, // the rival being felt about hears about it
            type: 'attitudeShift',
            msg: `${state.players[p].name} has grown ${band} toward you`,
          });
        }
      }
      out.lastBand = band;
    }
  }
  state.proposals = state.proposals.filter((pr) => !(pr.to === p && state.turn > pr.expiresTurn));
}
