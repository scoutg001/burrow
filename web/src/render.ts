// Style mapping: pure functions from graph data to colors, widths, and
// alphas. The canvas draw loop in main.ts consumes these; tests cover the
// mapping logic without a DOM.

import type { GraphEdge, GraphNode, NodeKind } from "./types.js";

export const PALETTE: Record<NodeKind, string> = {
  hub: "#e8a33d",
  site: "#4f9cf9",
  client: "#5fbf77",
  resource: "#9a86c9",
};

export const BG = "#16161d";
export const LABEL = "#c8c8d4";

/** Offline nodes stay visible but clearly dead. */
export function nodeAlpha(n: GraphNode): number {
  return n.health.online ? 1.0 : 0.32;
}

export function nodeColor(n: GraphNode): string {
  return PALETTE[n.kind];
}

export function edgeColor(e: GraphEdge): string {
  switch (e.kind) {
    case "peer": return e.health && !e.health.online ? "#5a3a3a" : "#7d8ca3";
    case "serves": return "#55607a";
    case "grant": return "#46584a";
  }
}

export function edgeWidth(e: GraphEdge): number {
  switch (e.kind) {
    case "peer": return 1.8;
    case "serves": return 1.1;
    case "grant": return 0.8;
  }
}

/** Grant edges draw dashed; structure draws solid. */
export function edgeDash(e: GraphEdge): number[] {
  return e.kind === "grant" ? [4, 5] : [];
}

/** Labels fade in as you zoom; resources need more zoom than sites. */
export function labelAlpha(kind: NodeKind, zoom: number): number {
  const threshold = kind === "resource" || kind === "client" ? 0.9 : 0.45;
  if (zoom <= threshold) return 0;
  return Math.min(1, (zoom - threshold) * 2.5);
}

/** Only the semantically directed edges get arrowheads: serves (site to
 * resource) and grant (client may reach resource). A WireGuard peer link is
 * bidirectional; an arrow there would mislead. */
export function isDirected(kind: GraphEdge["kind"]): boolean {
  return kind === "serves" || kind === "grant";
}

export interface Arrow {
  tip: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
}

/** Arrowhead triangle for an edge from (x1,y1) to (x2,y2), its tip resting
 * on the target node's rim (targetRadius back from the center). Returns
 * null for degenerate zero-length edges. */
export function arrowhead(
  x1: number, y1: number, x2: number, y2: number,
  targetRadius: number, size: number,
): Arrow | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const tip = { x: x2 - ux * targetRadius, y: y2 - uy * targetRadius };
  const bx = tip.x - ux * size;
  const by = tip.y - uy * size;
  const half = size * 0.55;
  return {
    tip,
    left: { x: bx - uy * half, y: by + ux * half },
    right: { x: bx + uy * half, y: by - ux * half },
  };
}
