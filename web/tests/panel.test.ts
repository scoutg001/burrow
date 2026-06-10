import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renderPanel } from "../src/panel.js";
import type { GraphModel } from "../src/types.js";

const health = (online: boolean) => ({
  online, handshakeAgeSec: null, rttMs: null, bytesInPerSec: null, bytesOutPerSec: null,
});

const model: GraphModel = {
  nodes: [
    { id: "client:1", kind: "client", name: "wanderer-one", addresses: ["100.90.128.2/24"], health: health(true) },
    { id: "sr:1", kind: "resource", name: "alpha-ssh", addresses: ["alpha-ssh.burrow.internal"], health: health(true) },
    { id: "site:1", kind: "site", name: "den-alpha", addresses: [], health: health(false) },
  ],
  edges: [
    { id: "g", kind: "grant", from: "client:1", to: "sr:1", health: null },
    { id: "s", kind: "serves", from: "site:1", to: "sr:1", health: null },
  ],
};

test("panel shows name, kind, state, addresses, and relations", () => {
  const html = renderPanel(model, model.nodes[0]);
  assert.match(html, /wanderer-one/);
  assert.match(html, /client/);
  assert.match(html, /online/);
  assert.match(html, /100\.90\.128\.2\/24/);
  assert.match(html, /can reach alpha-ssh/);
});

test("addresses render as copy chips carrying their value", () => {
  const html = renderPanel(model, model.nodes[1]);
  assert.match(html, /<button class="copy" data-copy="alpha-ssh\.burrow\.internal"/);
});

test("relations read from the other side too", () => {
  const html = renderPanel(model, model.nodes[1]);
  assert.match(html, /reachable by wanderer-one/);
  assert.match(html, /served by den-alpha/);
});

test("html-escapes names and addresses", () => {
  const m: GraphModel = {
    nodes: [{ id: "x", kind: "site", name: "<script>", addresses: ["a<b"], health: health(true) }],
    edges: [],
  };
  const html = renderPanel(m, m.nodes[0]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
