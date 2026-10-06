# pathbridge

A configurable path-to-URL forwarding proxy with a built-in admin UI.

Route selected URL paths to external upstreams through one host — useful when an
upstream API must be reached from a specific network or region, or when you want
a stable public hostname in front of changing backends.

## How it works

- Each **pair** maps a path prefix to a target origin, e.g. `/zalo` → `https://api.upstream.example`
- Requests to that prefix are proxied to the target with the upstream's Host header
- Pairs are managed at runtime — add, edit, or remove them from the admin UI, no rebuild
- Longest-prefix match wins; pairs can be individually disabled

## Run

```bash
docker run -d \
  -e ADMIN_PASSWORD=change-me \
  -e DATA_DIR=/data \
  -v pb-data:/data \
  -p 3000:3000 \
  ghcr.io/<you>/pathbridge
```

Put your own TLS terminator (nginx, Traefik, Caddy…) in front; the app itself is plain HTTP.

## Admin UI

Visit `/_admin`, enter the admin password. The same API is available programmatically:

```
GET    /_api/pairs                      # list
PUT    /_api/pairs                      # upsert  {"path":"/hook","target":"https://api.example.com"}
DELETE /_api/pairs/hook                 # remove by path
GET    /_health                         # liveness
```

All `/_api` routes require `Authorization: Bearer <ADMIN_PASSWORD>`.

### Pair fields

| field | meaning |
|---|---|
| `path` | URL prefix to claim (must start with `/`, not `/_`) |
| `target` | absolute upstream origin, e.g. `https://api.example.com` |
| `upstreamHost` | optional Host header override; defaults to target hostname |
| `stripPrefix` | remove the pair's prefix before forwarding |
| `note` | free-form label |
| `enabled` | `false` to park a pair |

## Configuration

| env | default | purpose |
|---|---|---|
| `ADMIN_PASSWORD` | — (required) | admin UI + API password |
| `DATA_DIR` | `./data` | where `pairs.json` lives |

## Notes

- Prefixes starting with `/_` are reserved (admin UI, API, health) and cannot be claimed by pairs.
- Pair state is a single JSON file — mount it on a volume to persist across restarts.
