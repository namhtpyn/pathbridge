# pathbridge

Route URL paths to external upstreams through one host — a lightweight
path-to-URL forwarding proxy with a built-in admin UI.

Useful when an upstream API must be reached from a specific network or region,
or when you want a stable public hostname in front of changing backends.

## Features

- **Path forwarding** — map `/prefix` → `https://api.example.com`, longest-prefix match wins
- **Admin UI** — dashboard with sidebar navigation (`/admin`), manage everything at runtime, no rebuilds or restarts
- **Realtime** — routes table and access-log tail update live in the admin UI
- **API** — programmatic access at `/rpc` with the same permissions as the UI
- **SSO** — one or more OIDC providers, per-provider login buttons
- **Users & roles** — RBAC with a permission matrix; custom roles
- **API keys** — programmatic access for scripts and agents
- **Access logs** — per-route request log with status and latency
- Single SQLite file, single container

## Quick start

### Docker

```bash
docker run -d \
  --name pathbridge \
  -p 3000:3000 \
  -v pb-data:/data \
  ghcr.io/namhtpyn/pathbridge
```

### Docker Compose

```yaml
services:
  pathbridge:
    image: ghcr.io/namhtpyn/pathbridge
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      BETTER_AUTH_SECRET: "change-me-to-a-long-random-string"
      # ADMIN_EMAIL: "admin@example.com"      # optional, first boot only
      # ADMIN_PASSWORD: "a-strong-password"    # optional, first boot only
    volumes:
      - pb-data:/data

volumes:
  pb-data:
```

Save as `compose.yaml` and run `docker compose up -d`. To upgrade later:
`docker compose pull && docker compose up -d`.

Open `http://localhost:3000/admin` and sign in with the seeded admin:

- email `admin@pathbridge.local`
- password: whatever you set in `ADMIN_PASSWORD`, or — when that is unset — the
  random one-time password printed once in the first boot's log. There is no
  fixed default password.

Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first boot if you want them fixed.
The seed runs only on a fresh database — never on restarts.

Put your own TLS terminator (nginx, Traefik, Caddy…) in front; the app itself
is plain HTTP.

## Configuration

| env | default | purpose |
|---|---|---|
| `DATA_DIR` | `/data` | database location (mount a volume) |
| `PORT` | `3000` | listen port |
| `DRIZZLE_DIR` | `./drizzle` (cwd) | migration folder; the boot runner applies every folder here into `__migrations` |
| `BETTER_AUTH_SECRET` | random per boot | auth/session signing secret. Generated fresh on every boot when unset, which invalidates sessions on restart — **set it in production**. |
| `BETTER_AUTH_URL` | unset (request host) | public base URL better-auth uses for generated links/callbacks (e.g. `https://pathbridge.example.com`). Set it behind a reverse proxy. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | empty | comma-separated EXTRA origins accepted by better-auth (on top of the request's own origin). Empty by default — values are trimmed, blanks dropped. |
| `NITRO_BUN_IDLE_TIMEOUT` | `255` | server idle timeout in seconds (max 255). Raised from the runtime default so long-lived live connections (admin realtime tables/logs) survive idle periods. Only lower it if you know why. |
| `OIDC_DISABLED_PASSWORD_LOGIN` | unset | legacy env fallback: `true` disables email+password login while an OIDC provider is configured. Settings → "Disable password login" is the normal switch. |

Everything else — OIDC providers, roles, retention — is configured in the
admin UI at runtime.

### Health

- `GET /health` — liveness (process up)
- `GET /health/ready` — readiness (database reachable)

The container image ships a Docker `HEALTHCHECK` probing `/health/ready`
every 30s (readiness failures mark the container `unhealthy`).

### Forwarding

Add a route in the admin UI (Routes → New route):

```json
{ "path": "/hook", "target": "https://api.example.com" }
```

Forwarding is deterministic, two modes:

- **Exact path** — `/hook` forwards to the target URL **verbatim**: a path on
  the target *is* the upstream path, and the request's own path is NOT appended.
  e.g. route `/zalo` with target `https://api.example.com/webhooks/zalo-oa`
  sends every `/zalo` request to exactly that URL.
- **Wildcard** — `/hook/*` forwards the remainder after the base:
  `/hook/abc` → `https://api.example.com/abc`.

Optional per-route settings: restrict HTTP methods, override the upstream
Host header, set or strip request/response headers, add a note, disable.

### API (`/rpc`)

Everything the admin UI does is also available to scripts:

```
POST /rpc/routes/count      Authorization: Bearer <session token or API key>
{"json": {}}                -> {"json": {"count": 3}}
```

Calls go to `POST /rpc/<procedure>` with body `{"json": <input>}`, authorized
with a session cookie or an API key (Bearer). A key carries its owner's
permissions, or a narrower scope you pick when creating it.

Procedures: `authConfig`, `version`, `session`, `me`,
`routes.{list,live,count,save,remove}`, `users.{list,live,save,update,setPassword,remove}`,
`roles.{list,live,save,update,remove}`, `settings.{get,save}`, `oidc.{list,save}`,
`keys.{list,create,rename,revoke}`, `logs.{recent,tail}`.

Live procedures (`*.live`, `logs.tail`) stream over SSE instead of answering
once — `.live` sends snapshots, `logs.tail` sends deltas only. Point an HTTP
client that understands `text/event-stream` at them. There is no other HTTP API
(`/api/*` is unused).

### MCP (AI agents)

A [Model Context Protocol](https://modelcontextprotocol.io) server is built in
at `/mcp` (streamable HTTP, stateless — auth on every request). Point any MCP
client at it with an API key:

```
url:    https://your-host/mcp
header: Authorization: Bearer <api key>
```

Tools: `list_routes`, `create_route`, `update_route`, `delete_route`, `get_logs`.
A key inherits its owner's permissions, or a narrowed scope you choose when
creating it — an agent key can be limited to exactly routes CRUD + log reads,
and nothing else.

### SSO (OIDC)

Settings → Authentication → Add provider: name, issuer URL, client ID, client
secret. Each provider gets a redirect URL to register with your identity
provider. Multiple providers are supported; a login with an email that already
exists links to that account.

## Disclaimer

This application was written entirely by an AI agent. It is provided **as is,
with no warranty of any kind** — use at your own risk. The author accepts no
responsibility or liability for any damage, data loss, or security issues
arising from running it. Review the code before deploying it anywhere that
matters.

## License

MIT
