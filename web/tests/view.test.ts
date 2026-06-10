import { strict as assert } from "node:assert";
import { test } from "node:test";
import { edgeViewAlpha, linkDistance, linkStrength } from "../src/view.js";

test("network view: transport structure dominates, grants are loose", () => {
  assert.ok(linkStrength("peer", "network") > linkStrength("grant", "network") * 10);
  assert.ok(linkStrength("serves", "network") > linkStrength("grant", "network") * 10);
  assert.equal(edgeViewAlpha("peer", "network"), 1);
});

test("access view: grants dominate, transport goes slack and fades", () => {
  assert.ok(linkStrength("grant", "access") > linkStrength("peer", "access") * 10);
  assert.ok(linkStrength("grant", "access") > linkStrength("serves", "access") * 2);
  assert.ok(linkDistance("grant", "access") < linkDistance("peer", "access"));
  assert.ok(edgeViewAlpha("peer", "access") < 0.5);
  assert.equal(edgeViewAlpha("grant", "access"), 1);
});
