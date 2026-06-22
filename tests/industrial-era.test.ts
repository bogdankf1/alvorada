import { describe, it, expect } from 'vitest';
import { ctx } from './helpers';

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
