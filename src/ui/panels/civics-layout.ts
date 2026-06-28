import type { PolicyDef } from '../../data/types';

export interface CivicNode { id: string; col: number; row: number; }
export interface CivicEdge { from: string; to: string; }
export interface CivicLayout { nodes: CivicNode[]; edges: CivicEdge[]; cols: string[]; rows: number; }

/**
 * Lay policies out as one column per branch, each policy on its own row within
 * the branch (sorted by prereq depth, then id). Unique row per node makes cell
 * collisions impossible; sorting by depth guarantees every prereq sits in a
 * strictly-lower row than its child. Edges connect each policy to its prereqs.
 */
export function civicsLayout(policies: PolicyDef[]): CivicLayout {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const depthCache = new Map<string, number>();
  const depth = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const p = byId.get(id)!;
    const d = p.prereqs.length ? 1 + Math.max(...p.prereqs.map(depth)) : 0;
    depthCache.set(id, d);
    return d;
  };

  const cols = [...new Set(policies.map((p) => p.branch))].sort();
  const nodes: CivicNode[] = [];
  let rows = 0;
  cols.forEach((branch, col) => {
    const inBranch = policies
      .filter((p) => p.branch === branch)
      .sort((a, b) => depth(a.id) - depth(b.id) || a.id.localeCompare(b.id));
    inBranch.forEach((p, row) => {
      nodes.push({ id: p.id, col, row });
      rows = Math.max(rows, row + 1);
    });
  });

  const edges: CivicEdge[] = [];
  for (const p of policies) for (const pre of p.prereqs) edges.push({ from: pre, to: p.id });

  return { nodes, edges, cols, rows };
}
