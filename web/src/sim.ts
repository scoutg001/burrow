// Force-simulation tuning: pure functions from node/edge kind to the numbers
// d3-force consumes. Kept free of d3 imports so they unit-test under Node.

import type { NodeKind } from "./types.js";

/** Visual radius in px (world units) per node kind. */
export function nodeRadius(kind: NodeKind): number {
  switch (kind) {
    case "hub": return 22;
    case "site": return 14;
    case "client": return 10;
    case "resource": return 7;
  }
}

/** Charge (repulsion) per node kind. */
export function chargeStrength(kind: NodeKind): number {
  switch (kind) {
    case "hub": return -900;
    case "site": return -500;
    case "client": return -350;
    case "resource": return -120;
  }
}

/** Collision radius keeps labels readable. */
export function collisionRadius(kind: NodeKind): number {
  return nodeRadius(kind) + 6;
}
