// Wiring: fetch the graph, run the d3-force simulation, draw to canvas, and
// handle pan/zoom/drag/click. All tunables and mappings live in the pure
// modules; this file is the only one that touches d3 or the DOM.

import * as d3force from "d3-force";

import { fetchGraph } from "./api.js";
import { applyView, buildSimulation, updateSimulation, type Sim, type SimLink } from "./forces.js";
import { hitTest, screenToWorld, zoomAround, type Transform } from "./interact.js";
import { mergeNodes, type SimNode } from "./merge.js";
import { renderPanel } from "./panel.js";
import { BG, LABEL, PALETTE, arrowhead, edgeColor, edgeDash, edgeWidth, isDirected, labelAlpha, nodeAlpha, nodeColor } from "./render.js";
import { renderStats } from "./sidebar.js";
import { edgeViewAlpha, type ViewMode } from "./view.js";
import { nodeRadius } from "./sim.js";
import type { GraphModel } from "./types.js";

const POLL_MS = 10_000;

const canvas = document.getElementById("graph") as HTMLCanvasElement;
const panel = document.getElementById("panel") as HTMLElement;
const status = document.getElementById("status") as HTMLElement;
const stats = document.getElementById("stats") as HTMLElement;
const ctx = canvas.getContext("2d")!;

let model: GraphModel = { nodes: [], edges: [] };
let nodes: SimNode[] = [];
let links: SimLink[] = [];
let sim: Sim | null = null;
let view: Transform = { x: 0, y: 0, k: 1 };
let selected: string | null = null;
let lastPollAt: number | null = null;
let viewMode: ViewMode = "network";

function refreshStats(): void {
  stats.innerHTML = renderStats(model, lastPollAt === null ? null : Date.now() - lastPollAt);
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeLinks(m: GraphModel, ns: SimNode[]): SimLink[] {
  const byId = new Map(ns.map((n) => [n.id, n]));
  return m.edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => ({ source: e.from, target: e.to, edge: e }));
}

function applyModel(next: GraphModel): void {
  model = next;
  nodes = mergeNodes(nodes, next);
  links = makeLinks(next, nodes);
  if (!sim) {
    sim = buildSimulation(d3force, nodes, links, canvas.clientWidth / 2, canvas.clientHeight / 2, viewMode);
    view = { x: 0, y: 0, k: 1 };
  } else {
    updateSimulation(sim, nodes, links);
  }
  if (selected && !nodes.some((n) => n.id === selected)) {
    selected = null;
    panel.innerHTML = "";
  }
  refreshPanel();
}

function refreshPanel(): void {
  if (!selected) return;
  const n = model.nodes.find((x) => x.id === selected);
  panel.innerHTML = n ? renderPanel(model, n) : "";
}

function draw(): void {
  ctx.save();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.translate(view.x, view.y);
  ctx.scale(view.k, view.k);

  for (const l of links) {
    const s = l.source as SimNode;
    const t = l.target as SimNode;
    if (s.x === undefined || t.x === undefined) continue;
    ctx.globalAlpha = edgeViewAlpha(l.edge.kind, viewMode);
    ctx.strokeStyle = edgeColor(l.edge);
    ctx.lineWidth = edgeWidth(l.edge) / view.k;
    ctx.setLineDash(edgeDash(l.edge).map((d) => d / view.k));
    ctx.beginPath();
    ctx.moveTo(s.x!, s.y!);
    ctx.lineTo(t.x!, t.y!);
    ctx.stroke();
    if (isDirected(l.edge.kind)) {
      const a = arrowhead(s.x!, s.y!, t.x!, t.y!, nodeRadius(t.kind) + 2 / view.k, 7 / view.k);
      if (a) {
        ctx.setLineDash([]);
        ctx.fillStyle = edgeColor(l.edge);
        ctx.beginPath();
        ctx.moveTo(a.tip.x, a.tip.y);
        ctx.lineTo(a.left.x, a.left.y);
        ctx.lineTo(a.right.x, a.right.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  for (const n of nodes) {
    if (n.x === undefined) continue;
    const r = nodeRadius(n.kind);
    ctx.globalAlpha = nodeAlpha(n);
    ctx.fillStyle = nodeColor(n);
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
    ctx.fill();
    if (n.id === selected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / view.k;
      ctx.stroke();
    }
    const la = labelAlpha(n.kind, view.k) * nodeAlpha(n);
    if (la > 0) {
      ctx.globalAlpha = la;
      ctx.fillStyle = LABEL;
      ctx.font = `${12 / view.k}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(n.name, n.x!, n.y! + r + 14 / view.k);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  requestAnimationFrame(draw);
}

// --- pointer handling: drag a node, or pan the view ------------------------

let dragging: SimNode | null = null;
let panning = false;
let lastX = 0;
let lastY = 0;
let moved = false;

canvas.addEventListener("pointerdown", (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  lastX = ev.offsetX;
  lastY = ev.offsetY;
  moved = false;
  const w = screenToWorld(view, ev.offsetX, ev.offsetY);
  const hit = hitTest(nodes as Required<SimNode>[], w.x, w.y, view.k);
  if (hit) {
    dragging = nodes.find((n) => n.id === hit.id) ?? null;
    sim?.alphaTarget(0.25).restart();
  } else {
    panning = true;
  }
});

canvas.addEventListener("pointermove", (ev) => {
  const dx = ev.offsetX - lastX;
  const dy = ev.offsetY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  if (dragging) {
    const w = screenToWorld(view, ev.offsetX, ev.offsetY);
    dragging.fx = w.x;
    dragging.fy = w.y;
  } else if (panning) {
    view = { ...view, x: view.x + dx, y: view.y + dy };
  }
  lastX = ev.offsetX;
  lastY = ev.offsetY;
});

canvas.addEventListener("pointerup", (ev) => {
  if (dragging) {
    sim?.alphaTarget(0);
    if (!moved) {
      // A click (no drag): select, and release any pin from a previous drag.
      dragging.fx = null;
      dragging.fy = null;
      selected = dragging.id;
      refreshPanel();
    }
    // After a real drag the node stays pinned where the user left it.
    dragging = null;
  } else if (panning && !moved) {
    selected = null;
    panel.innerHTML = "";
  }
  panning = false;
  canvas.releasePointerCapture(ev.pointerId);
});

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  view = zoomAround(view, ev.offsetX, ev.offsetY, factor);
}, { passive: false });

// Copy chips in the detail panel. clipboard.writeText needs a secure
// context (https or localhost); the textarea fallback covers plain-http LAN
// viewing.
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

panel.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest("button.copy") as HTMLButtonElement | null;
  if (!btn) return;
  void copyText(btn.dataset.copy ?? "").then(() => {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  });
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    selected = null;
    panel.innerHTML = "";
  }
});

document.querySelectorAll<HTMLInputElement>('input[name="view"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    viewMode = input.value as ViewMode;
    if (sim) applyView(sim, viewMode);
  });
});

// The legend's node swatches take their colors from the renderer's palette,
// so the two cannot drift apart.
document.querySelectorAll<HTMLElement>(".swatch").forEach((el) => {
  const kind = el.dataset.kind as keyof typeof PALETTE;
  el.style.background = PALETTE[kind];
});

// --- boot -------------------------------------------------------------------

async function poll(): Promise<void> {
  try {
    applyModel(await fetchGraph());
    lastPollAt = Date.now();
    status.textContent = "";
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : String(e);
  }
  refreshStats();
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
refreshStats();
setInterval(refreshStats, 1000);
void poll();
setInterval(() => void poll(), POLL_MS);
