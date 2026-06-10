// Persistent sidebar content: mesh stats rendered from the current model.
// Pure HTML string rendering, tested under Node; main.ts owns the element.

import type { GraphModel, NodeKind } from "./types.js";

function tally(model: GraphModel, kind: NodeKind): { online: number; total: number } {
  const of = model.nodes.filter((n) => n.kind === kind);
  return { online: of.filter((n) => n.health.online).length, total: of.length };
}

export function pollAgeText(ageMs: number | null): string {
  if (ageMs === null) return "waiting for first poll";
  const s = Math.round(ageMs / 1000);
  return s <= 1 ? "just now" : `${s}s ago`;
}

export function renderStats(model: GraphModel, ageMs: number | null): string {
  const hub = model.nodes.find((n) => n.kind === "hub");
  const sites = tally(model, "site");
  const clients = tally(model, "client");
  const resources = tally(model, "resource");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return [
    `<h1>${esc(hub ? hub.name : "burrow")}</h1>`,
    `<dl>`,
    `<dt>sites</dt><dd>${sites.online}/${sites.total} online</dd>`,
    `<dt>clients</dt><dd>${clients.online}/${clients.total} online</dd>`,
    `<dt>resources</dt><dd>${resources.total}</dd>`,
    `<dt>updated</dt><dd>${pollAgeText(ageMs)}</dd>`,
    `</dl>`,
  ].join("");
}
