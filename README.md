# Burrow

A live node-map for a [Pangolin](https://github.com/fosrl/pangolin) WireGuard mesh. Burrow draws every site, client, and resource in your mesh as a force-directed graph and keeps it live: nodes dim when a connector goes offline and links thicken with traffic.

Pangolin's dashboard shows the mesh as tables. Burrow shows it as the graph it actually is.

## Status

Design and Phase 0 (API verification) complete; the topology renderer is under construction. See `docs/DESIGN.md` for the architecture and `docs/PHASE0-FINDINGS.md` for what the Pangolin integration API and gerbil's metrics endpoint actually expose, verified against a live Community stack on 2026-06-09.

## Shape

One container: a Rust daemon that polls Pangolin's integration API (topology, grants, online state) and gerbil's Prometheus metrics (per-peer byte counters), merges them into one graph model, and serves a static page (TypeScript, d3-force, Canvas 2D) over plain HTTP with SSE for live updates. No fork of Pangolin, no database access, no write operations; Burrow is a read-only API consumer that drops onto the existing `pangolin` compose network.

## License

Apache-2.0.
