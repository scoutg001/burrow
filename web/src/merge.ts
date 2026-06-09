// Identity-preserving merge: apply a fresh /graph snapshot onto the running
// simulation's nodes without resetting the layout. Positions and velocities
// carry over by node id; new nodes spawn near a connected neighbor when one
// exists so they enter the frame gracefully.

import type { GraphModel, GraphNode } from "./types.js";

export interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export function mergeNodes(prev: SimNode[], next: GraphModel): SimNode[] {
  const old = new Map(prev.map((n) => [n.id, n]));
  const neighbor = new Map<string, string>();
  for (const e of next.edges) {
    if (!neighbor.has(e.to)) neighbor.set(e.to, e.from);
    if (!neighbor.has(e.from)) neighbor.set(e.from, e.to);
  }
  return next.nodes.map((n) => {
    const o = old.get(n.id);
    if (o) {
      // Keep position, velocity, and any user pin; refresh the data fields.
      return { ...o, ...n, x: o.x, y: o.y, vx: o.vx, vy: o.vy, fx: o.fx, fy: o.fy };
    }
    const near = neighbor.get(n.id);
    const anchor = near ? old.get(near) : undefined;
    if (anchor && anchor.x !== undefined && anchor.y !== undefined) {
      return { ...n, x: anchor.x + (Math.random() - 0.5) * 30, y: anchor.y + (Math.random() - 0.5) * 30 };
    }
    return { ...n };
  });
}
