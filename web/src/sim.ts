// Force-simulation tuning: pure functions from node/edge kind to the numbers
// d3-force consumes. Kept free of d3 imports so they unit-test under Node.

import type { EdgeKind, NodeKind } from "./types.js";

/** Visual radius in px (world units) per node kind. */
export function nodeRadius(kind: NodeKind): number {
  switch (kind) {
    case "hub": return 22;
    case "site": return 14;
    case "client": return 10;
    case "resource": return 7;
  }
}

/** Rest length of a link per edge kind. Peer links are the long spokes;
 * serves links cluster resources tightly behind their site. */
export function linkDistance(kind: EdgeKind): number {
  switch (kind) {
    case "peer": return 140;
    case "serves": return 46;
    case "grant": return 180;
  }
}

/** Link strength: structure pulls hard, grants barely pull at all (they are
 * drawn, not enforced, so the layout stays a hub-and-spokes tree). */
export function linkStrength(kind: EdgeKind): number {
  switch (kind) {
    case "peer": return 0.7;
    case "serves": return 0.9;
    case "grant": return 0.03;
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
