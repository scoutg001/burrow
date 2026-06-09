# Burrow dev stack

A throwaway Pangolin Community instance used to develop and verify Burrow against real API responses and real WireGuard peers. Nothing here is production; every credential in this directory is disposable.

## Layout

- `docker-compose.yml`: pangolin + gerbil, ports bound to 127.0.0.1 (3000 internal API, 3002 dashboard, 3003 integration API, 3004 gerbil metrics). No traefik; this stack is reached from localhost only.
- `docker-compose.newt.yml`: two live newt connectors for the seeded sites den-alpha and den-bravo.
- `docker-compose.olm.yml`: one live olm client (wanderer-one).
- `config/config.yml`: pangolin config with `flags.enable_integration_api: true`. Contains a generated throwaway secret; the file is gitignored, recreate it from `config/upstream-config.example.yml` if lost (any 32-char secret works).
- `.env`: admin login, API key, newt/olm credentials. Gitignored, chmod 600.

## Start and stop

```sh
sudo docker compose up -d                          # core stack
sudo docker compose -f docker-compose.newt.yml up -d   # live site peers
sudo docker compose -f docker-compose.olm.yml up -d    # live client
sudo docker compose stop                           # pause, keep state
```

Use `stop`, not `down -v`: the seeded org, sites, clients, resources, and grants live in pangolin's SQLite volume under `config/` and Phase 2 development needs them.

## Seeded state (2026-06-09)

Org `burrow-dev`. Sites: den-alpha (siteId 1), den-bravo (siteId 2), both live via newt. Clients: wanderer-one (live via olm), wanderer-two, wanderer-three. Site-resources and grants: alpha-ssh (clients 1,2), alpha-print (client 1), bravo-ssh (clients 2,3), bravo-cam (client 3).

The admin session flow, seeding commands, and every gotcha hit while building this are recorded in `../docs/PHASE0-FINDINGS.md`. Known quirk: the org was created with hand-picked /24 subnets, which breaks newt's client-relay sub-feature ("invalid IP address format: 100.90.128.0" in newt logs). Sites and the olm client still connect; recreate the org with `pick-org-defaults` values if full client routing is ever needed.

## Smoke test

```sh
source .env
curl -s -H "Authorization: Bearer $PANGOLIN_API_TOKEN" \
  http://localhost:3003/v1/org/burrow-dev/sites | python3 -m json.tool
curl -s http://localhost:3004/metrics | grep gerbil_wg
```
