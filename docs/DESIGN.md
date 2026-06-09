# Burrow: design

A live node-map of a Pangolin WireGuard mesh. One screen that shows every site, client, and resource as a force-directed graph, with link health drawn on top: who's online, how stale the last handshake is, round-trip latency, and bytes per second.

Status: design, 2026-06-09. No code yet. This document is the spec the implementation plan is built from.

## Why this exists

Pangolin's dashboard presents the mesh as tables: a sites table, a resources table, a clients list. To answer "is the franklin tunnel up, and what can thor-mc actually reach right now" you read across three tables and hold the joins in your head. There is no view that draws the mesh as a graph. As of 2026-06-09 nobody has filed an issue or discussion in `fosrl/pangolin` asking for one, and the dashboard ships no topology view (the only map in the product, `src/components/WorldMap.tsx`, is a geographic choropleth of request counts, not a node-link graph).

Burrow draws that graph and keeps it live.

## What it is, and what it is not

Burrow is an out-of-tree tool. It consumes Pangolin's public integration API and gerbil's metrics endpoint over HTTP and renders the result. It does not patch Pangolin, fork its dashboard, or read its database directly.

That boundary is a deliberate strategic choice, not a shortcut. The `fosrl/pangolin` maintainers (Owen and Milo Schwartz, the two CODEOWNERS on every file) gate net-new architecture hard. Their CONTRIBUTING guide says, verbatim, "Stick to established patterns: Avoid introducing new architectures or abstractions without discussing them with us first" and "Prefer improvements over new features." Their sanctioned extension surface is the integration API, and heavier integrations live in adjacent repos by their own pattern: the Kubernetes operator became a separate repo, `fosrl/pangolin-kube-controller`, rather than landing in the main tree. An out-of-tree API consumer is exactly the shape they point extenders toward.

Explicitly out of scope, with the reason recorded so the decision survives:

- **A Pangolin dashboard-plugin architecture.** Tempting as a foundation, but it's the single hardest thing to land with this project: never requested, against the "no new abstractions" posture, and a control-ceding abstraction that two solo maintainers who review every line have shown no appetite for. An abstraction earns its place once it has two or more real consumers; building the framework before the first consumer ships is the move their guide warns against. If Burrow gets traction, proposing an in-tree pane or a plugin seam becomes a later, earned move, pitched with a working artifact instead of a pitch.
- **Writing to the mesh.** Burrow reads. It does not create, edit, or delete sites, clients, resources, or grants.
- **Replacing Pangolin's auth.** Burrow holds an API key and renders. If you want it gated behind login, you expose it as a Pangolin resource (see Deployment).

## Architecture

Two units, split the way `arm-core` and `arm-web` are split: a Rust daemon that owns data, a static page that owns pixels.

```
 Pangolin integration API  ─┐
   (topology + grants)      │   ┌─────────────────────┐      ┌──────────────┐
                            ├──▶│   burrow daemon      │─────▶│ static web   │
 gerbil /metrics  ─────────┘   │   (Rust)             │ HTTP │ page (TS/ESM)│
   (liveness, RTT, bytes)      │  TopologyCollector   │ +SSE │ d3-force +   │
                               │  LivenessCollector   │      │ Canvas 2D    │
                               │  merge → graph model │      └──────────────┘
                               │  GET /graph, /events │
                               └─────────────────────┘
```

The daemon serves the static assets itself, so the whole thing is one binary and one container.

### The daemon (Rust)

A single binary. Configuration by environment variable, no config file for the common case:

- `PANGOLIN_API_URL`: base URL of the integration API (for example `https://api.example.com/v1`).
- `PANGOLIN_API_KEY`: the read key.
- `GERBIL_METRICS_URL`: gerbil's Prometheus endpoint (for example `http://gerbil:3004/metrics`). Optional; absent means topology-only (Phase 1 mode).
- `BURROW_POLL_INTERVAL`: seconds between polls. Default 10, matching gerbil's own ~10s metric refresh.
- `BURROW_LISTEN`: bind address. Default `0.0.0.0:2700`.

Two collectors sit behind one `Collector` trait so each is testable against canned fixtures without a live Pangolin:

- **`TopologyCollector`** calls the integration API and returns the static graph: orgs, sites, clients, resources, and the grant edges between clients and resources. This is the only data source Phase 1 needs.
- **`LivenessCollector`** scrapes gerbil's `/metrics` (Prometheus text format) and parses the per-peer gauges and counters gerbil already computes: `gerbil_wg_peer_connected` (1/0), `gerbil_wg_handshake_latency_seconds`, `gerbil_wg_peer_rtt_seconds`, `gerbil_wg_bytes_received_total`, `gerbil_wg_bytes_transmitted_total`.

A merge step joins liveness onto topology by peer public key and tunnel IP, producing one graph model. The daemon holds the current model in memory, diffs each new poll against the last, and serves:

- `GET /graph`: the full current snapshot as JSON.
- `GET /events`: Server-Sent Events: a `snapshot` event on connect, then `delta` events when a node or edge changes. SSE over WebSocket because the data flow is one-way (server to browser) and SSE is plain HTTP with auto-reconnect built into the browser's `EventSource`.

That's the entire HTTP surface. Two read endpoints and the static files.

### The graph model

Nodes carry a type and a health block. Edges carry a type and, where it applies, a health block.

Node types:

- `hub`: the Pangolin server with gerbil. One per mesh, the center of mass in the layout.
- `site`: a Newt connector (in the 3DPGH mesh: franklin, farm2).
- `client`: an Olm machine client (thor-mc, edison-mc, franklin-mc).
- `resource`: a siteResource (ssh endpoints, the PFM API, the printers).

Edge types:

- `peer`: a WireGuard tunnel: hub to site, hub to client. Carries health (this is the link that can be up or down, fast or slow).
- `serves`: a site to the resources behind it. Structural.
- `grant`: a client to a resource it's allowed to reach. Structural; the answer to "what can this client touch."

Health block, filled in by phase:

```
{ online: bool, handshakeAgeSec: number|null, rttMs: number|null,
  bytesInPerSec: number|null, bytesOutPerSec: number|null }
```

The model is generic. No 3DPGH names are compiled in; it renders whatever the API and metrics return for any org on any Pangolin.

### The web page (static TS/ESM)

Built with bare `tsc` to ESM, no framework, served as static files. `d3-force` runs the layout simulation (the force module only, not the d3 bundle). Canvas 2D draws it, because a few hundred nodes redrawn at animation rate is the case Canvas is built for and SVG is not.

Interaction: pan, zoom, drag a node to pin it, click a node for a detail panel (its type, alias, addresses, grants, and current health). The page opens an `EventSource` on `/events` and applies deltas as they arrive.

The live overlay, layered onto the same graph:

- Offline node (`online: false`): desaturated and dimmed.
- Fresh handshake: a short pulse animation on the node when `handshakeAgeSec` drops.
- Latency: node ring color graded by `rttMs`.
- Throughput: `peer` edge thickness scaled to `bytesInPerSec + bytesOutPerSec`, so a busy tunnel reads as a thick line.

## Deployment and the "native feel" without a fork

Burrow ships as one container image. The default deployment adds it as a service on Pangolin's existing `pangolin` compose network, where it can reach `pangolin` and `gerbil` by service name. Reach the UI directly on its port, or, for the same-domain-and-login experience, register Burrow as a Pangolin resource so it sits behind Pangolin's own SSO at a path on the dashboard host. That second option is config in the operator's Pangolin, not code in Burrow, and it's how Burrow feels native without touching the dashboard.

## Phasing

The "live" depth is staged so the first shippable version carries no liveness complexity at all.

**Phase 0: verify the API on a throwaway stack.** Stand up a Pangolin Community instance on Thor in Docker. Read the live `/v1/docs` Swagger to pin the exact list endpoints for sites, clients, resources, and grants, the auth header (docs say `Authorization: Bearer`, one source-level description says `x-api-key`; the live Swagger settles it), and confirm the read-only integration API is in the free Community tier. The research surfaced a paid "stable public API with access control" Professional-license feature; Phase 0 confirms the free integration API covers topology reads before any code depends on it. No production mesh is touched in this or any other phase's development.

**Phase 1: topology map.** Daemon runs `TopologyCollector` only. Page renders the static force graph: hub, sites, clients, resources, with `serves` and `grant` edges. No gerbil, no SSE needed (the page can poll `/graph` on a timer). This is a complete, useful tool on its own and the milestone where Burrow becomes worth installing.

**Phase 2: handshake liveness.** Add `LivenessCollector`, the merge, and the SSE stream. Nodes grey out when offline and pulse on a fresh handshake. This is the "live" that answers "is it up right now."

**Phase 3: latency and throughput.** Same data source as Phase 2, more of its fields: RTT grading and throughput-scaled edges, plus small per-node sparklines for bytes/sec. Richest view, no new external dependency.

## Testing

Each collector is tested against checked-in fixture files (a captured integration-API JSON response, a captured gerbil `/metrics` text dump), so the merge and the model can be verified with no live Pangolin in the loop. The daemon gets an integration test that boots it against a fixture server and asserts the `/graph` JSON. The web page's layout and overlay logic (the parts that aren't drawing) are unit-tested as plain functions.

## Repo, license, naming

- **Repo:** a standalone repo on Gianni's personal GitHub (`scoutg001`), with `3dprintpittsburgh` added as a collaborator. Created when implementation starts, not before. Drafted locally in `~/workspace/burrow/` first.
- **License:** Apache-2.0. OSI-approved, permissive, with a patent grant. As a separate tool that talks to Pangolin only over HTTP, it carries no license entanglement with Pangolin's AGPL, and Apache-2.0 maximizes adoption and reuse.
- **Name:** Burrow. Pangolins dig burrows; a burrow is a network of tunnels; WireGuard is tunnels.

## Open questions, resolved at Phase 0

1. Exact integration-API list endpoints for clients and resources, and whether any per-client liveness field exists on the management API (the research found only a site-level `online` boolean documented).
2. The auth header.
3. That topology reads are in the free Community tier.

All three are answered by reading the live Swagger on the throwaway stack, before writing code that depends on the answers.
