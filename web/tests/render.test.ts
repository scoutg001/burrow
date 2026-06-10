import { strict as assert } from "node:assert";
import { test } from "node:test";
import { edgeColor, edgeDash, labelAlpha, nodeAlpha } from "../src/render.js";
import type { GraphEdge, GraphNode } from "../src/types.js";

const health = (online: boolean) => ({
  online, handshakeAgeSec: null, rttMs: null, bytesInPerSec: null, bytesOutPerSec: null,
});
const node = (online: boolean): GraphNode => ({
  id: "site:1", kind: "site", name: "x", addresses: [], health: health(online),
});
const edge = (kind: GraphEdge["kind"], online: boolean | null): GraphEdge => ({
  id: "e", kind, from: "a", to: "b", health: online === null ? null : health(online),
});

test("offline nodes dim but stay visible", () => {
  assert.equal(nodeAlpha(node(true)), 1);
  const dimmed = nodeAlpha(node(false));
  assert.ok(dimmed > 0 && dimmed < 0.5, String(dimmed));
});

test("offline peer edges shift to the dead color", () => {
  assert.notEqual(edgeColor(edge("peer", false)), edgeColor(edge("peer", true)));
});

test("only grant edges dash", () => {
  assert.ok(edgeDash(edge("grant", null)).length > 0);
  assert.equal(edgeDash(edge("peer", true)).length, 0);
  assert.equal(edgeDash(edge("serves", null)).length, 0);
});

test("labels appear with zoom, structural nodes first", () => {
  assert.equal(labelAlpha("site", 0.2), 0);
  assert.ok(labelAlpha("site", 1.0) > 0);
  assert.ok(labelAlpha("site", 0.8) > labelAlpha("resource", 0.8));
  assert.equal(labelAlpha("resource", 2.0), 1);
});

test("only serves and grant edges are directed", async () => {
  const { isDirected } = await import("../src/render.js");
  assert.ok(isDirected("serves"));
  assert.ok(isDirected("grant"));
  assert.ok(!isDirected("peer"));
});

test("arrowhead tip rests on the target rim, base spans behind it", async () => {
  const { arrowhead } = await import("../src/render.js");
  const a = arrowhead(0, 0, 100, 0, 10, 6)!;
  assert.ok(Math.abs(a.tip.x - 90) < 1e-9 && Math.abs(a.tip.y) < 1e-9);
  assert.ok(a.left.x < a.tip.x && a.right.x < a.tip.x, "base sits behind the tip");
  assert.ok(Math.abs(a.left.y + a.right.y) < 1e-9, "base is symmetric about the edge");
  assert.equal(arrowhead(5, 5, 5, 5, 10, 6), null, "degenerate edge");
});
