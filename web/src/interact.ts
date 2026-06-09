// View transform and hit-testing: pure math consumed by the pointer handlers
// in main.ts.

import type { NodeKind } from "./types.js";
import { nodeRadius } from "./sim.js";

export interface Transform {
  x: number; // screen-space translation
  y: number;
  k: number; // zoom factor
}

export interface Positioned {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
}

export function screenToWorld(t: Transform, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}

export function worldToScreen(t: Transform, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * t.k + t.x, y: wy * t.k + t.y };
}

/** Zoom around a screen-space anchor so the point under the cursor stays put. */
export function zoomAround(t: Transform, sx: number, sy: number, factor: number): Transform {
  const k = Math.min(8, Math.max(0.15, t.k * factor));
  const w = screenToWorld(t, sx, sy);
  return { k, x: sx - w.x * k, y: sy - w.y * k };
}

/** Topmost node whose disc contains the world-space point; small nodes get a
 * minimum touch radius so they stay clickable when zoomed out. */
export function hitTest(nodes: Positioned[], wx: number, wy: number, zoom: number): Positioned | null {
  const minTouch = 8 / zoom;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const r = Math.max(nodeRadius(n.kind), minTouch);
    const dx = n.x - wx;
    const dy = n.y - wy;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}
