# Burrow

A live node-map for a [Pangolin](https://github.com/fosrl/pangolin) WireGuard mesh. Burrow draws every site, client, and resource in your mesh as a force-directed graph and keeps it live: nodes dim when a connector goes offline and links thicken with traffic.

Pangolin's dashboard shows the mesh as tables. Burrow shows it as the graph it actually is.

## Status

Phase 1 (the topology map) works end to end: the daemon polls the integration API and the page renders the live force-directed graph with online state. Liveness streaming (SSE) and traffic overlays are next; see `docs/DESIGN.md` for the architecture and `docs/PHASE0-FINDINGS.md` for what Pangolin's integration API and gerbil's metrics actually expose, verified against a live Community stack on 2026-06-09.

## Running it

1. Enable the integration API in pangolin's `config.yml` (`flags: enable_integration_api: true`; it listens on port 3003).
2. Create an org API key in the dashboard (Server Admin, API Keys) and grant it the read actions: `getOrg, listSites, getSite, listClients, getClient, listSiteResources, getSiteResource, listResources, getResource`.
3. Run the burrow container next to pangolin (see `deploy/docker-compose.snippet.yml`) with `PANGOLIN_API_URL`, `PANGOLIN_API_TOKEN` (`<apiKeyId>.<apiKeySecret>`), and `PANGOLIN_ORG_ID` set.
4. Open port 2700: pan, zoom, drag to pin, click a node for details.

## Developing

- Daemon: `cargo test`, then `cargo run` with the three `PANGOLIN_*` variables pointed at a dev stack (`dev/README.md` describes the throwaway Pangolin Community stack used for development).
- Web page: `cd web && npm install && npm run check` (tsc build plus Node test-runner tests). The page is plain TypeScript compiled by `tsc`; d3-force is vendored in `web/vendor/` (see `VENDOR.md` there).

## Shape

One container: a Rust daemon that polls Pangolin's integration API (topology, grants, online state) and gerbil's Prometheus metrics (per-peer byte counters), merges them into one graph model, and serves a static page (TypeScript, d3-force, Canvas 2D) over plain HTTP with SSE for live updates. No fork of Pangolin, no database access, no write operations; Burrow is a read-only API consumer that drops onto the existing `pangolin` compose network.

## License

Apache-2.0.
