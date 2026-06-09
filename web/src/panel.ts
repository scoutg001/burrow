// Detail panel: pure HTML rendering for a selected node. main.ts assigns the
// result to the panel element's innerHTML.

import type { GraphEdge, GraphModel, GraphNode } from "./types.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nameOf(model: GraphModel, id: string): string {
  const n = model.nodes.find((x) => x.id === id);
  return n ? n.name : id;
}

function relations(model: GraphModel, node: GraphNode): string[] {
  const lines: string[] = [];
  const fmt = (e: GraphEdge): string => {
    const other = e.from === node.id ? e.to : e.from;
    const name = esc(nameOf(model, other));
    switch (e.kind) {
      case "peer": return `peer link with ${name}`;
      case "serves": return e.from === node.id ? `serves ${name}` : `served by ${name}`;
      case "grant": return e.from === node.id ? `can reach ${name}` : `reachable by ${name}`;
    }
  };
  for (const e of model.edges) {
    if (e.from === node.id || e.to === node.id) lines.push(fmt(e));
  }
  return lines;
}

export function renderPanel(model: GraphModel, node: GraphNode): string {
  const addr = node.addresses.map((a) => `<li><code>${esc(a)}</code></li>`).join("");
  const rels = relations(model, node).map((r) => `<li>${r}</li>`).join("");
  const state = node.health.online ? "online" : "offline";
  return [
    `<h2>${esc(node.name)}</h2>`,
    `<p class="kind">${node.kind} &middot; <span class="${state}">${state}</span></p>`,
    addr ? `<h3>Addresses</h3><ul>${addr}</ul>` : "",
    rels ? `<h3>Connections</h3><ul>${rels}</ul>` : "",
  ].join("\n");
}
