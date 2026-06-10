// View modes: which relationships dominate the layout. A view is pure data
// consumed by the force stack (strength/distance) and the renderer (alpha).
//
// "network" draws the transport architecture: WireGuard peers and the
// site-serves-resource hierarchy are the structure, grants are loose
// decoration. "access" inverts it into the ACL tree: grant edges pull hard
// so clients cluster around what they can reach, and the transport
// scaffolding goes slack and fades to context.

import type { EdgeKind } from "./types.js";

export type ViewMode = "network" | "access";

export const VIEW_MODES: ViewMode[] = ["network", "access"];

interface EdgeTuning {
  distance: number;
  strength: number;
  alpha: number;
}

const VIEWS: Record<ViewMode, Record<EdgeKind, EdgeTuning>> = {
  network: {
    peer: { distance: 140, strength: 0.7, alpha: 1.0 },
    serves: { distance: 46, strength: 0.9, alpha: 1.0 },
    grant: { distance: 180, strength: 0.03, alpha: 0.85 },
  },
  access: {
    peer: { distance: 200, strength: 0.04, alpha: 0.2 },
    serves: { distance: 80, strength: 0.25, alpha: 0.35 },
    grant: { distance: 70, strength: 0.8, alpha: 1.0 },
  },
};

export function linkDistance(kind: EdgeKind, view: ViewMode): number {
  return VIEWS[view][kind].distance;
}

export function linkStrength(kind: EdgeKind, view: ViewMode): number {
  return VIEWS[view][kind].strength;
}

export function edgeViewAlpha(kind: EdgeKind, view: ViewMode): number {
  return VIEWS[view][kind].alpha;
}
