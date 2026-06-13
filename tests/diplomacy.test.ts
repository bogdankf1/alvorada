import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, declareWarBetween } from './helpers';
import { hasMet } from '../src/engine/selectors';
import { findPath } from '../src/engine/map/pathfind';
import { captureCity } from '../src/engine/systems/cities';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { attitude, valueDeal, resolveProposal } from '../src/engine/diplomacy-eval';
import type { Proposal } from '../src/engine/types';

describe('met flag', () => {
  it('is set when a unit sees a rival unit, and is sticky', () => {
    const s = flatWorld(12, 10, 2);
    spawn(s, 0, 'warrior', 4, 4);
    spawn(s, 1, 'warrior', 5, 4); // within sight of player 0's warrior
    refreshVis(s);
    expect(hasMet(s, 0, 1)).toBe(true);
    expect(hasMet(s, 1, 0)).toBe(true); // symmetric
  });

  it('stays unmet when far apart', () => {
    const s = flatWorld(20, 12, 2);
    spawn(s, 0, 'warrior', 2, 2);
    spawn(s, 1, 'warrior', 14, 10); // far corner, well outside sight range
    refreshVis(s);
    expect(hasMet(s, 0, 1)).toBe(false);
  });
});

describe('attitude', () => {
  it('is neutral between two untouched, distant players at peace', () => {
    const s = flatWorld(20, 12, 2);
    const a = attitude(ctx, s, 1, 0);
    expect(a.band).toBe('neutral');
    expect(a.factors.every((f) => typeof f.label === 'string')).toBe(true);
  });

  it('war makes the band hostile and is reflected in the factors', () => {
    const s = flatWorld(20, 12, 2);
    declareWarBetween(s, 0, 1);
    s.relations[1][0].grudge = ctx.rules.settings.diplomacy.grudgeOnWar;
    const a = attitude(ctx, s, 1, 0);
    expect(a.band).toBe('hostile');
    expect(a.factors.some((f) => f.label.toLowerCase().includes('war'))).toBe(true);
  });

  it('mutual friendship lifts the band to at least cordial', () => {
    const s = flatWorld(20, 12, 2);
    s.relations[0][1].friends = true;
    s.relations[1][0].friends = true;
    const a = attitude(ctx, s, 1, 0);
    expect(['cordial', 'friendly']).toContain(a.band);
  });
});

const prop = (over: Partial<Proposal>): Proposal => ({
  id: 1, from: 0, to: 1, give: { gold: 0 }, take: { gold: 0 }, expiresTurn: 99, ...over,
});

describe('valueDeal', () => {
  it('values pure lump gold at face, from the recipient side', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    const p = prop({ give: { gold: 100 }, take: { gold: 0 } }); // player 0 gives 100 to player 1
    expect(valueDeal(ctx, s, 1, p)).toBe(100); // recipient (1) receives 100
    expect(valueDeal(ctx, s, 0, p)).toBe(-100); // giver (0) is down 100
  });

  it('values gold-per-turn over the horizon', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    const p = prop({ give: { gold: 0, goldPerTurn: { amount: 5, turns: 30 } }, take: { gold: 0 } });
    const h = ctx.rules.settings.diplomacy.goldPerTurnHorizon;
    expect(valueDeal(ctx, s, 1, p)).toBe(5 * h);
  });
});

function meet(s: ReturnType<typeof flatWorld>, a: number, b: number) {
  s.relations[a][b].met = true;
  s.relations[b][a].met = true;
}

describe('resolveProposal', () => {
  it('accepts a clearly favorable deal', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    const p = prop({ give: { gold: 200 }, take: { gold: 0 } }); // 0 gifts 1 → great for 1
    expect(resolveProposal(ctx, s, p, false).kind).toBe('accept');
  });

  it('rejects a one-sided demand from a neutral AI', () => {
    const s = flatWorld(20, 12, 2);
    s.players[1].gold = 500;
    const p = prop({ give: { gold: 0 }, take: { gold: 200 } }); // 0 demands 200 from 1 → bad for 1
    expect(resolveProposal(ctx, s, p, false).kind).toBe('reject');
  });

  it('counters a near-miss when allowed, demanding the gap in gold', () => {
    const s = flatWorld(20, 12, 2);
    s.players[0].gold = 500;
    // 0 offers 1 a small gift that is just under 1's neutral accept margin
    const margin = ctx.rules.settings.diplomacy.acceptMargin.neutral;
    const p = prop({ give: { gold: margin - 5 }, take: { gold: 0 } });
    const r = resolveProposal(ctx, s, p, true);
    expect(r.kind).toBe('counter');
    if (r.kind === 'counter') expect(r.take.gold).toBeGreaterThan(0);
  });
});

import type { GameState } from '../src/engine/types';
const endTurn2 = (s: GameState) => applyAction(ctx, s, { type: 'END_TURN', player: s.currentPlayer });
const fullRound2 = (s: GameState) => {
  const n = s.players.filter((p) => p.alive).length;
  for (let i = 0; i < n; i++) s = endTurn2(s);
  return s;
};

describe('obligations tick', () => {
  it('pays gold-per-turn each round and expires at term end', () => {
    let s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    s.players[0].gold = 100;
    s.relations[0][1].goldPerTurn = 10;
    s.relations[0][1].goldUntil = s.turn + 1; // pays this turn and next, then expires
    const before1 = s.players[1].gold;
    s = fullRound2(s); // player 0's turn-start pays
    expect(s.players[1].gold).toBe(before1 + 10);
    s = fullRound2(s);
    s = fullRound2(s);
    // after goldUntil passes, the flow is cleared
    expect(s.relations[0][1].goldPerTurn).toBe(0);
  });

  it('open borders expire after their term', () => {
    let s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    s.relations[0][1].openBordersUntil = s.turn; // expires next time player 0 processes
    s = fullRound2(s);
    expect(s.relations[0][1].openBordersUntil).toBe(0);
  });
});

describe('open borders', () => {
  it('lets a unit path into a peaceful rival\'s land only when granted', () => {
    // Build a state where player 1 owns territory and player 0 wants to cross it.
    // Use a wide map so coordinates are well within bounds.
    const base = flatWorld(20, 14, 2);
    meet(base, 0, 1);
    // Give player 1 a settler at (10,7) and found a city so they own the surrounding ring
    spawn(base, 1, 'settler', 10, 7);
    const unitId = Object.keys(base.units).map(Number)[0];
    const founded = applyAction(ctx, { ...base, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: unitId });
    // Thaw and place player 0's warrior well to the left of player 1's city
    const s = structuredClone(founded) as typeof founded;
    const w = spawn(s as any, 0, 'warrior', 7, 7);
    refreshVis(s as any);
    // Closed borders: player 0 cannot path onto player 1's owned tile (9,7 is in city ring)
    const blocked = findPath(ctx, s as any, (s as any).units[w.id], { q: 9, r: 7 });
    expect(blocked).toBeNull();
    // Grant open borders 1→0
    (s as any).relations[1][0].openBordersUntil = (s as any).turn + 5;
    const open = findPath(ctx, s as any, (s as any).units[w.id], { q: 9, r: 7 });
    expect(open).not.toBeNull();
  });
});

describe('diplomacy actions', () => {
  it('gifting gold to an AI is accepted and transfers gold', () => {
    const s0 = flatWorld(16, 10, 2);
    s0.players[0].gold = 300;
    meet(s0, 0, 1);
    const s = applyAction(ctx, s0, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 100 }, take: { gold: 0 } });
    expect(s.players[0].gold).toBe(200);
    expect(s.players[1].gold).toBe(100);
  });

  it('a one-sided demand on a neutral AI is rejected, no transfer', () => {
    const s0 = flatWorld(16, 10, 2);
    s0.players[1].gold = 300;
    meet(s0, 0, 1);
    const s = applyAction(ctx, s0, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 0 }, take: { gold: 200 } });
    expect(s.players[1].gold).toBe(300);
    expect(s.events.some((e) => e.type === 'dealRejected')).toBe(true);
  });

  it('open-borders deal sets a directional term', () => {
    const s0 = flatWorld(16, 10, 2);
    s0.players[0].gold = 1000;
    meet(s0, 0, 1);
    // bribe player 1 to open its borders to player 0
    const s = applyAction(ctx, s0, {
      type: 'PROPOSE_DEAL', player: 0, to: 1,
      give: { gold: 300 }, take: { gold: 0, openBorders: true },
    });
    expect(s.relations[1][0].openBordersUntil).toBe(s.turn + ctx.rules.settings.diplomacy.termLength);
  });

  it('making peace ends a war both ways and cancels pacts', () => {
    const s0 = flatWorld(16, 10, 2);
    declareWarBetween(s0, 0, 1);
    meet(s0, 0, 1);
    s0.relations[0][1].openBordersUntil = 99; // a leftover pact
    s0.players[0].gold = 500;
    // sweeten with gold so the hostile AI (margin=40) accepts; net must reach 40
    const s = applyAction(ctx, s0, {
      type: 'PROPOSE_DEAL', player: 0, to: 1,
      give: { gold: 50, peace: true }, take: { gold: 0, peace: true },
    });
    expect(s.relations[0][1].status).toBe('peace');
    expect(s.relations[1][0].status).toBe('peace');
    expect(s.relations[0][1].openBordersUntil).toBe(0); // pact cancelled
  });

  it('denounce sets the flag, cancels friendship, and is rejected if repeated', () => {
    const s0 = flatWorld(16, 10, 2);
    meet(s0, 0, 1);
    s0.relations[0][1].friends = true;
    s0.relations[1][0].friends = true;
    const s = applyAction(ctx, s0, { type: 'DENOUNCE', player: 0, target: 1 });
    expect(s.relations[0][1].denounced).toBe(true);
    expect(s.relations[0][1].friends).toBe(false);
    expect(validateAction(ctx, s, { type: 'DENOUNCE', player: 0, target: 1 }).ok).toBe(false);
  });

  it('declaring war cancels gold-per-turn and stamps a grudge', () => {
    const s0 = flatWorld(16, 10, 2);
    meet(s0, 0, 1);
    s0.relations[0][1].goldPerTurn = 5;
    s0.relations[0][1].goldUntil = 99;
    const s = applyAction(ctx, s0, { type: 'DECLARE_WAR', player: 0, target: 1 });
    expect(s.relations[0][1].status).toBe('war');
    expect(s.relations[0][1].goldPerTurn).toBe(0);
    expect(s.relations[1][0].grudge).toBe(ctx.rules.settings.diplomacy.grudgeOnWar);
  });

  it('rejects negotiating with an unmet power', () => {
    const s = flatWorld(16, 10, 2);
    expect(validateAction(ctx, s, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 0 }, take: { gold: 0 } }).ok).toBe(false);
  });
});

describe('capture grudge', () => {
  it('the former owner resents the conqueror', () => {
    const s = flatWorld(16, 10, 2);
    // give player 1 a city, then capture it as player 0
    const settler = spawn(s, 1, 'settler', 8, 5);
    const s1 = applyAction(ctx, { ...s, currentPlayer: 1 }, { type: 'FOUND_CITY', player: 1, unit: settler.id });
    const draft = structuredClone(s1) as any;
    const city = Object.values(draft.cities)[0] as any;
    captureCity(ctx, draft, city, 0);
    expect(draft.relations[1][0].grudge).toBeGreaterThanOrEqual(ctx.rules.settings.diplomacy.grudgeOnCapture);
  });
});

describe('diplomacy validation hardening', () => {
  it('rejects denouncing a power you are already at war with', () => {
    const s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    declareWarBetween(s, 0, 1);
    expect(validateAction(ctx, s, { type: 'DENOUNCE', player: 0, target: 1 }).ok).toBe(false);
  });

  it('rejects non-integer / NaN gold in a proposal', () => {
    const s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    s.players[0].gold = 100;
    expect(validateAction(ctx, s, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: NaN }, take: { gold: 0 } }).ok).toBe(false);
    expect(validateAction(ctx, s, { type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 2.5 }, take: { gold: 0 } }).ok).toBe(false);
  });

  it('broken tribute stamps the data-driven grudge on the stiffed party', () => {
    let s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    s.players[0].gold = 0; // cannot pay
    s.relations[0][1].goldPerTurn = 10;
    s.relations[0][1].goldUntil = s.turn + 5;
    s = fullRound2(s); // player 0's turn-start tries to pay, fails
    expect(s.relations[1][0].grudge).toBe(ctx.rules.settings.diplomacy.grudgeOnBrokenDeal);
    expect(s.relations[0][1].goldPerTurn).toBe(0); // flow collapsed
  });
});

import { initiateDiplomacy } from '../src/ai/diplomacy';

describe('AI diplomacy initiation', () => {
  it('an AI losing a war proposes peace to its attacker', () => {
    const s = flatWorld(16, 10, 2);
    meet(s, 0, 1);
    declareWarBetween(s, 0, 1);
    // player 0 is strong, player 1 is weak → player 1 should sue for peace
    spawn(s, 0, 'swordsman', 3, 3);
    spawn(s, 0, 'swordsman', 3, 4);
    spawn(s, 1, 'warrior', 9, 6);
    const action = initiateDiplomacy(ctx, s, 1);
    expect(action?.type).toBe('PROPOSE_DEAL');
    if (action?.type === 'PROPOSE_DEAL') {
      expect(action.give.peace && action.take.peace).toBe(true);
      expect(action.to).toBe(0);
    }
  });

  it('returns null when there is nothing worth proposing', () => {
    const s = flatWorld(16, 10, 2); // unmet, at peace
    expect(initiateDiplomacy(ctx, s, 1)).toBeNull();
  });
});
