import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hitTest, screenToWorld, worldToScreen, zoomAround, type Positioned, type Transform } from "../src/interact.js";

test("screen/world transforms round-trip", () => {
  const t: Transform = { x: 40, y: -12, k: 1.7 };
  const w = screenToWorld(t, 200, 300);
  const s = worldToScreen(t, w.x, w.y);
  assert.ok(Math.abs(s.x - 200) < 1e-9 && Math.abs(s.y - 300) < 1e-9);
});

test("zoomAround keeps the anchor point fixed", () => {
  const t: Transform = { x: 0, y: 0, k: 1 };
  const before = screenToWorld(t, 150, 90);
  const z = zoomAround(t, 150, 90, 1.5);
  const after = screenToWorld(z, 150, 90);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
  assert.equal(z.k, 1.5);
});

test("zoom clamps to sane bounds", () => {
  const t: Transform = { x: 0, y: 0, k: 1 };
  let z = t;
  for (let i = 0; i < 50; i++) z = zoomAround(z, 0, 0, 2);
  assert.ok(z.k <= 8);
  for (let i = 0; i < 80; i++) z = zoomAround(z, 0, 0, 0.5);
  assert.ok(z.k >= 0.15);
});

test("hitTest picks the topmost node and respects radius by kind", () => {
  const nodes: Positioned[] = [
    { id: "hub", kind: "hub", x: 0, y: 0 },
    { id: "sr", kind: "resource", x: 0, y: 0 },
  ];
  // Both overlap at origin; the later (topmost-drawn) node wins.
  assert.equal(hitTest(nodes, 0, 0, 1)?.id, "sr");
  // 18px out: inside the hub disc (r=22), outside the resource disc (r=7).
  assert.equal(hitTest(nodes, 18, 0, 1)?.id, "hub");
  assert.equal(hitTest(nodes, 400, 0, 1), null);
});

test("small nodes keep a minimum touch radius when zoomed out", () => {
  const nodes: Positioned[] = [{ id: "sr", kind: "resource", x: 0, y: 0 }];
  // At k=0.25 the minimum touch radius is 32 world units.
  assert.equal(hitTest(nodes, 20, 0, 0.25)?.id, "sr");
  assert.equal(hitTest(nodes, 20, 0, 4), null);
});
