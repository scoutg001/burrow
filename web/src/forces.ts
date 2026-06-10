// The force stack, extracted from main.ts so the simulation's behavior is
// testable under Node: the d3-force namespace is injected (main.ts passes
// the real import; tests pass the vendored bundle loaded by file path).

import type { Simulation, SimulationLinkDatum } from "d3-force";
import type { GraphEdge } from "./types.js";
import type { SimNode } from "./merge.js";
import { chargeStrength, collisionRadius } from "./sim.js";
import { linkDistance, linkStrength, type ViewMode } from "./view.js";

export type D3Force = typeof import("d3-force");
export type SimLink = SimulationLinkDatum<SimNode> & { edge: GraphEdge };
export type Sim = Simulation<SimNode, SimLink>;

// Gravity is forceX/forceY (per-node velocity nudges toward the center),
// NOT forceCenter. forceCenter translates every node so the swarm MEAN sits
// at the center; a user-pinned node (fx/fy) biases that mean but is immune
// to the correction, so the correction lands on the free nodes alone and
// they walk away from the pin a little every tick (d3-force simulation.js
// restores fx after forces run). The regression test in tests/forces.test.ts
// pins a node off-center and asserts the swarm holds its ground.
const GRAVITY_STRENGTH = 0.05;

export function buildSimulation(
  d3: D3Force,
  nodes: SimNode[],
  links: SimLink[],
  cx: number,
  cy: number,
  view: ViewMode = "network",
): Sim {
  return d3
    .forceSimulation<SimNode>(nodes)
    .force("charge", d3.forceManyBody<SimNode>().strength((n) => chargeStrength(n.kind)))
    .force("x", d3.forceX<SimNode>(cx).strength(GRAVITY_STRENGTH))
    .force("y", d3.forceY<SimNode>(cy).strength(GRAVITY_STRENGTH))
    .force("collide", d3.forceCollide<SimNode>().radius((n) => collisionRadius(n.kind)))
    .force(
      "link",
      d3
        .forceLink<SimNode, SimLink>(links)
        .id((n) => n.id)
        .distance((l) => linkDistance(l.edge.kind, view))
        .strength((l) => linkStrength(l.edge.kind, view)),
    );
}

/** Apply a merged snapshot to a running simulation and reheat it. */
export function updateSimulation(sim: Sim, nodes: SimNode[], links: SimLink[]): void {
  sim.nodes(nodes);
  const link = sim.force("link") as ReturnType<D3Force["forceLink"]>;
  link.links(links as never);
  sim.alpha(0.3).restart();
}

/** Retune the link force for a different view; positions carry over so the
 * layout morphs instead of resetting. */
export function applyView(sim: Sim, view: ViewMode): void {
  type LinkForce = {
    distance: (f: (l: SimLink) => number) => LinkForce;
    strength: (f: (l: SimLink) => number) => LinkForce;
  };
  const link = sim.force("link") as unknown as LinkForce;
  link.distance((l) => linkDistance(l.edge.kind, view)).strength((l) => linkStrength(l.edge.kind, view));
  sim.alpha(0.6).restart();
}
