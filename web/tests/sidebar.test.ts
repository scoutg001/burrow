import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pollAgeText, renderStats } from "../src/sidebar.js";
import type { GraphModel, GraphNode, NodeKind } from "../src/types.js";

const health = (online: boolean) => ({
  online, handshakeAgeSec: null, rttMs: null, bytesInPerSec: null, bytesOutPerSec: null,
});
const n = (id: string, kind: NodeKind, online: boolean): GraphNode => ({
  id, kind, name: id, addresses: [], health: health(online),
});
const model: GraphModel = {
  nodes: [
    n("hub", "hub", true),
    n("site:1", "site", true), n("site:2", "site", false),
    n("client:1", "client", true), n("client:2", "client", false), n("client:3", "client", false),
    n("sr:1", "resource", true),
  ],
  edges: [],
};

test("stats tally online counts per kind", () => {
  const html = renderStats(model, 2000);
  assert.match(html, /<h1>hub<\/h1>/);
  assert.match(html, /sites<\/dt><dd>1\/2 online/);
  assert.match(html, /clients<\/dt><dd>1\/3 online/);
  assert.match(html, /resources<\/dt><dd>1</);
  assert.match(html, /2s ago/);
});

test("poll age wording", () => {
  assert.equal(pollAgeText(null), "waiting for first poll");
  assert.equal(pollAgeText(400), "just now");
  assert.equal(pollAgeText(11_400), "11s ago");
});
