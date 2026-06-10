import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildSimulation, type D3Force, type SimLink } from "../src/forces.js";
import type { SimNode } from "../src/merge.js";

// Load the real vendored bundle by file path (resolved at runtime from
// build/tests/, so the specifier is computed to keep tsc out of it).
const vendorPath = "../../vendor/d3-force-3.0.0.min.js";
const d3 = (await import(vendorPath)) as D3Force;

const health = { online: true, handshakeAgeSec: null, rttMs: null, bytesInPerSec: null, bytesOutPerSec: null };

function star(sites: number): { nodes: SimNode[]; links: SimLink[] } {
  const nodes: SimNode[] = [{ id: "hub", kind: "hub", name: "hub", addresses: [], health }];
  const links: SimLink[] = [];
  for (let i = 0; i < sites; i++) {
    nodes.push({ id: `site:${i}`, kind: "site", name: `s${i}`, addresses: [], health });
    links.push({
      source: "hub",
      target: `site:${i}`,
      edge: { id: `peer:site:${i}`, kind: "peer", from: "hub", to: `site:${i}`, health },
    });
  }
  return { nodes, links };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Regression for the drag-drift bug: a node pinned (fx/fy) away from the
// center must not push the rest of the swarm in the opposite direction.
// With forceCenter that is exactly what happens: the pinned node biases the
// mean, the recentering shift lands only on free nodes, and the free swarm
// walks away from the pin a little more every tick.
test("a pinned node does not drive the free swarm away from it", () => {
  const { nodes, links } = star(8);
  const sim = buildSimulation(d3, nodes, links, 0, 0);
  sim.stop();
  sim.tick(300); // settle the unpinned layout

  const pinned = nodes[1];
  const freeXs = () => nodes.filter((n) => n !== pinned).map((n) => n.x!);
  const before = mean(freeXs());

  // What pointerup leaves behind after a drag: the node pinned where the
  // user dropped it, well to the right of the swarm.
  pinned.fx = (pinned.x ?? 0) + 600;
  pinned.fy = pinned.y ?? 0;
  sim.alpha(0.5);
  sim.tick(400);

  assert.equal(pinned.x, pinned.fx, "pinned node stays put");
  const after = mean(freeXs());
  // Linked neighbors may legitimately move a little toward the pin; what
  // they must never do is collectively flee it.
  assert.ok(
    after >= before - 25,
    `free swarm drifted ${Math.round(before - after)}px away from the pin`,
  );
});
