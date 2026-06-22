import { describe, it, expect } from 'vitest';
import { ctx } from './helpers';
import { flatWorld, spawn, refreshVis, thaw } from './helpers';
import { canProduce } from '../src/engine/selectors';
import { applyAction } from '../src/engine/reducer';
import { tileIndex } from '../src/engine/hex';

describe('industrial era + capstone', () => {
  it('the science capstone is electricity', () => {
    expect(ctx.rules.settings.victory.scienceCapstone).toBe('electricity');
  });
  it('the turn limit is bumped to 300', () => {
    expect(ctx.rules.settings.victory.turnLimit).toBe(300);
  });
  it('electricity exists in the industrial era and its prereq closure pulls in the whole tree', () => {
    const e = ctx.rules.techs['electricity'];
    expect(e?.era).toBe('industrial');
    const seen = new Set<string>(); const stack = ['electricity'];
    while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); for (const p of ctx.rules.techs[id].prereqs) stack.push(p); }
    expect(seen.has('scientific_method')).toBe(true);
    expect(seen.has('chemistry')).toBe(true);
    expect(seen.has('industrialization')).toBe(true);
  });
  it('the industrial era is registered', () => {
    expect(ctx.rules.eras.some((e) => e.id === 'industrial')).toBe(true);
  });
});

describe('industrial units', () => {
  function coastalCity(techs: string[]) {
    let s = flatWorld(18, 12, 2);
    for (let r = 0; r < s.mapH; r++) for (let q = 8; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
    }
    const settler = spawn(s, 0, 'settler', 7, 5); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id }); s = thaw(s);
    s.players[0].techs.push(...techs);
    return { s, id: Object.keys(s.cities).map(Number)[0] };
  }
  it('rifleman needs rifling; artillery needs ballistics', () => {
    const { s, id } = coastalCity([]);
    const c = s.cities[id];
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'rifleman' }).ok).toBe(false);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'artillery' }).ok).toBe(false);
    s.players[0].techs.push('rifling', 'ballistics');
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'rifleman' }).ok).toBe(true);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'artillery' }).ok).toBe(true);
  });
  it('ironclad needs steam_power AND coal (and a coastal city)', () => {
    const { s, id } = coastalCity(['steam_power']);
    expect(canProduce(ctx, s, s.cities[id], { kind: 'unit', id: 'ironclad' }).ok).toBe(false); // no coal
  });
  it('obsolescence extends: musketman→rifling, frigate→steam_power', () => {
    const { s, id } = coastalCity(['gunpowder', 'metallurgy']);
    const c = s.cities[id];
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'musketman' }).ok).toBe(true);
    s.players[0].techs.push('rifling', 'steam_power');
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'musketman' }).ok).toBe(false);
    expect(canProduce(ctx, s, c, { kind: 'unit', id: 'frigate' }).ok).toBe(false);
  });
});
