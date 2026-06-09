import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chargeStrength, collisionRadius, linkDistance, linkStrength, nodeRadius } from "../src/sim.js";

test("node radii order: hub > site > client > resource", () => {
  assert.ok(nodeRadius("hub") > nodeRadius("site"));
  assert.ok(nodeRadius("site") > nodeRadius("client"));
  assert.ok(nodeRadius("client") > nodeRadius("resource"));
});

test("serves links are the shortest and strongest structure", () => {
  assert.ok(linkDistance("serves") < linkDistance("peer"));
  assert.ok(linkStrength("serves") > linkStrength("grant"));
});

test("grant links barely pull so the layout stays a tree", () => {
  assert.ok(linkStrength("grant") < 0.1);
});

test("collision radius exceeds the visual radius for every kind", () => {
  for (const k of ["hub", "site", "client", "resource"] as const) {
    assert.ok(collisionRadius(k) > nodeRadius(k), k);
    assert.ok(chargeStrength(k) < 0, `${k} repels`);
  }
});
