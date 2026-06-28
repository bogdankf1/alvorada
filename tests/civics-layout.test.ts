import { describe, it, expect } from 'vitest';
import { civicsLayout } from '../src/ui/panels/civics-layout';
import { POLICIES } from '../src/data/standard/policies';

describe('civicsLayout', () => {
  const policies = Object.values(POLICIES);
  const layout = civicsLayout(policies);

  it('places exactly one node per policy and never collides', () => {
    expect(layout.nodes.length).toBe(policies.length);
    const seen = new Set<string>();
    for (const n of layout.nodes) {
      const key = `${n.col},${n.row}`;
      expect(seen.has(key)).toBe(false); // no two nodes share a cell
      seen.add(key);
    }
  });

  it('places every prereq in a strictly-lower row, same branch column', () => {
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const p of policies) {
      for (const pre of p.prereqs) {
        const child = byId.get(p.id)!;
        const parent = byId.get(pre)!;
        expect(parent.row).toBeLessThan(child.row);
        expect(parent.col).toBe(child.col);
      }
    }
  });

  it('emits exactly one edge per prereq relationship', () => {
    const total = policies.reduce((n, p) => n + p.prereqs.length, 0);
    expect(layout.edges.length).toBe(total);
  });
});
