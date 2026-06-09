# Phase 0 findings

Verified 2026-06-09 against a throwaway Pangolin Community stack (images `fosrl/pangolin:latest`, `fosrl/gerbil:latest`, `fosrl/newt:latest` 1.12.5, `fosrl/olm:latest` 1.5.0) running in Docker on a single host, seeded with 2 newt sites, 3 olm clients (1 live), and 4 site-resources with client grants. This document resolves the three open questions in DESIGN.md and amends Phases 2 and 3 based on what the running system actually exposes.

## 1. Auth header (resolved)

`Authorization: Bearer <apiKeyId>.<apiKeySecret>`. The token is a composite of the key id and the secret joined by a dot; both come from the create-key response. Source-verified in `server/middlewares/integration/verifyApiKey.ts` (it splits the bearer token on `.` and hash-verifies the second half). `x-api-key` is not read anywhere; sending it returns 401. Keys are org-scoped by default; each permitted action must be granted to the key explicitly (`POST /org/{orgId}/api-key/{apiKeyId}/actions`, action ids from `server/auth/actions.ts`). The read actions Burrow needs: `getOrg, listSites, getSite, listClients, getClient, listSiteResources, getSiteResource, listResources, getResource, listResourceRoles, listResourceUsers`.

## 2. Topology list endpoints (resolved; richer than expected)

All confirmed working on Community with an org key, base `http://<host>:3003/v1`:

| Data | Endpoint |
|---|---|
| Org | `GET /org/{orgId}` |
| Sites | `GET /org/{orgId}/sites` |
| Clients | `GET /org/{orgId}/clients` |
| Site-resources (mesh TCP/UDP) | `GET /org/{orgId}/site-resources` |
| Proxy resources (HTTP) | `GET /org/{orgId}/resources` |
| Grants for one site-resource | `GET /site-resource/{siteResourceId}/clients` |

The client-list endpoint exists; DESIGN.md's fallback for its absence is moot. Responses arrive in an envelope: `{"data": {"sites": [...], "pagination": {"total", "pageSize", "page"}}, "success", "message", "status"}`. Pagination defaults to `pageSize=20`, `page=1`, both overridable as query params; the daemon must page through totals above the page size. `GET /orgs` is root-key-only (403 on an org key), so Burrow takes its org id from config.

## 3. Community tier (resolved)

Topology reads work on the Community edition. The integration API must be enabled in `config.yml` (`flags.enable_integration_api: true`) and listens on its own port, default 3003. The unauthenticated spec lives at `/v1/openapi.json` (Swagger UI at `/v1/docs/`); the captured copy is `fixtures/pangolin/openapi.json`, reporting "Pangolin Integration API v1".

## 4. Join key (resolved)

Both sites and clients carry a `pubKey` field in their API objects, and gerbil labels every per-peer series with `peer=<base64 WireGuard public key>`. Verified byte-for-byte on the dev stack: site den-alpha's API `pubKey` matches its `gerbil_wg_bytes_received_total{peer=...}` label exactly. The merge is a string equality on the public key. No IP-based fallback is needed.

## 5. Gerbil metrics: what is actually wired (major finding)

The gerbil observability doc lists per-peer `gerbil_wg_peer_connected`, `gerbil_wg_handshakes_total`, `gerbil_wg_handshake_latency_seconds`, and `gerbil_wg_peer_rtt_seconds`. None of them are emitted by the running container, and the reason is in the source: the setter functions (`RecordPeerConnected`, `RecordHandshake`, `RecordHandshakeLatency`, `RecordPeerRTT` in `internal/metrics/metrics.go`, gerbil@main as of 2026-06-09) are called only from `internal/metrics/metrics_test.go`. No production code path feeds them.

What gerbil does emit per peer, verified live with two connected newt sites:

- `gerbil_wg_bytes_received_total{ifname, peer}` (counter)
- `gerbil_wg_bytes_transmitted_total{ifname, peer}` (counter)
- `gerbil_wg_interface_up{ifname, instance}` (gauge), `gerbil_wg_peers_total{ifname}` (gauge)

Consequences:

- Per-peer connected/handshake/RTT from gerbil is unavailable today.
- Liveness comes from the management API instead: both site and client objects carry an `online` boolean, observed flipping false to true within seconds of the corresponding connector starting.
- RTT has no source anywhere in the stack today. Phase 3's latency feature is replaced by activity freshness (time since the peer's byte counters last moved), which the bytes counters support.
- Upstream opportunity: wiring the four orphaned setters into gerbil's monitor loop is a small, single-purpose PR of the exact shape the fosrl maintainers merge. Worth proposing once Burrow exists as a working consumer.

## 6. Client architecture: clients peer with sites, not the hub

The olm client's WireGuard session terminates at the newt site, not at gerbil: with one olm client online, gerbil still reports `gerbil_wg_peers_total 2` (the two sites only). The client's API object carries a `sites` array naming the site(s) it connects through. So the graph model's `peer` edges split:

- hub to site: backed by gerbil bytes counters plus `site.online`.
- client to site: from `client.sites[]`, liveness from `client.online`, traffic (if needed) from the API's `megabytesIn/megabytesOut` fields, which sites and clients both carry.

DESIGN.md drew client peer edges to the hub; the renderer should draw them to the connecting site when `sites[]` is non-empty and fall back to the hub when it is empty.

## 7. Amended phasing

- Phase 2 (liveness): poll the integration API's `online` fields and diff; no gerbil dependency at all. SSE design unchanged.
- Phase 3 (throughput + activity): scrape gerbil for hub-to-site byte rates (counter deltas over the poll interval, keyed by pubKey); derive per-link activity freshness from counter movement; use API `megabytesIn/Out` deltas for client links. RTT is dropped pending the upstream gerbil fix.

## 8. Gotchas recorded for development

- Org creation: take `subnet` and `utilitySubnet` from `GET /api/v1/pick-org-defaults`. Hand-picked /24s produced a maskless `clientAddress` ("100.90.128.0") that newt rejects ("invalid IP address format"), which disables its client-relay feature. Sites still work; client routing degrades.
- The internal dashboard API (port 3000, used only for seeding the dev stack) requires header `X-CSRF-Token: x-csrf-protection` on every non-GET (`server/middlewares/csrfProtection.ts`).
- Site create/client create want the defaults endpoints' generated credentials passed back in (`pick-site-defaults`, `pick-client-defaults`).
- `PUT /org/{orgId}/site-resource` requires `userIds`, `roleIds`, and `clientIds` arrays; grants are set in the same call.
- The dev org's id is `burrow-dev`; admin login is in `dev/.env` (gitignored).
