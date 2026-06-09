import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mergeNodes, type SimNode } from "../src/merge.js";
import type { GraphModel, GraphNode } from "../src/types.js";

const health = (online: boolean) => ({
  online, handshakeAgeSec: null, rttMs: null, bytesInPerSec: null, bytesOutPerSec: null,
});
const gnode = (id: string, online = true): GraphNode => ({
  id, kind: "site", name: id, addresses: [], health: health(online),
});

test("existing nodes keep position, velocity, and pins; data refreshes", () => {
  const prev: SimNode[] = [{ ...gnode("site:1", true), x: 10, y: 20, vx: 1, vy: 2, fx: 10, fy: 20 }];
  const next: GraphModel = { nodes: [gnode("site:1", false)], edges: [] };
  const merged = mergeNodes(prev, next);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].x, 10);
  assert.equal(merged[0].fy, 20);
  assert.equal(merged[0].health.online, false, "data field refreshed");
});

test("new nodes spawn near a connected neighbor", () => {
  const prev: SimNode[] = [{ ...gnode("hub"), x: 100, y: 100 }];
  const next: GraphModel = {
    nodes: [gnode("hub"), gnode("site:9")],
    edges: [{ id: "e", kind: "peer", from: "hub", to: "site:9", health: null }],
  };
  const merged = mergeNodes(prev, next);
  const fresh = merged.find((n) => n.id === "site:9")!;
  assert.ok(Math.abs(fresh.x! - 100) <= 15, String(fresh.x));
  assert.ok(Math.abs(fresh.y! - 100) <= 15, String(fresh.y));
});

test("removed nodes drop out", () => {
  const prev: SimNode[] = [{ ...gnode("site:1"), x: 1, y: 1 }, { ...gnode("site:2"), x: 2, y: 2 }];
  const next: GraphModel = { nodes: [gnode("site:2")], edges: [] };
  const merged = mergeNodes(prev, next);
  assert.deepEqual(merged.map((n) => n.id), ["site:2"]);
});
