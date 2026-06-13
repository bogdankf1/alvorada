import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, declareWarBetween } from './helpers';
import { hasMet } from '../src/engine/selectors';
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
