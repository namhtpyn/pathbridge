# pathbridge

A configurable path-to-URL forwarding proxy with a built-in admin UI.

Route selected URL paths to external upstreams through one host — useful when an
upstream API must be reached from a specific network or region, or when you want
a stable public hostname in front of changing backends.

## How it works

- Each **pair** maps a path prefix to a target origin, e.g. `/hook` → `https://api.upstream.example`
- Requests to that prefix are proxied to the target with the upstream's Host header
- Pairs are managed at runtime — add, edit, or remove them from the admin UI, no rebuild
- Longest-prefix match wins; pairs can be individually disabled

## Run

```bash
docker run -d \
  -e DATA_DIR=/data \
  -v pb-data:/data \
  -p 3000:3000 \
  ghcr.io/namhtpyn/pathbridge
```

Put your own TLS terminator (nginx, Traefik, Caddy…) in front; the app itself is plain HTTP.

## First-run setup

1. Create the admin user:

```bash
docker exec -it <container> bun scripts/create-admin.ts admin@example.com <password>
```

2. Sign in at `/_admin`.

## Admin API

Same API the UI uses, session-cookie authenticated:

```
GET    /api/pairs            # list
PUT    /api/pairs            # upsert  {"path":"/hook","target":"https://api.example.com"}
DELETE /api/pairs/hook       # remove by path
GET    /_health              # liveness
POST   /_auth/sign-in/email  # better-auth endpoints under /_auth/*
```

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
| `DATA_DIR` | `./data` | where `pathbridge.db` lives |
| `PORT` | `3000` | listen port |
| `DRIZZLE_DIR` | `./drizzle` | migrations dir (bundled) |

## Tech

- Nuxt 4 (Nitro) — catch-all bridge middleware
- better-auth (drizzle relations-v2 adapter) — email+password sessions
- drizzle-orm rc + bun:sqlite — storage, RQB query style, runtime migrations
- 100% strict TypeScript

## Notes

- Prefixes starting with `/_` are reserved (admin UI, auth, health, API) and cannot be claimed by pairs.
- State lives in a single SQLite file — mount it on a volume to persist across restarts.

## License

MIT
