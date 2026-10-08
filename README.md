# pathbridge

Route URL paths to external upstreams through one host — a lightweight
path-to-URL forwarding proxy with a built-in admin UI.

Useful when an upstream API must be reached from a specific network or region,
or when you want a stable public hostname in front of changing backends.

## Features

- **Path forwarding** — map `/prefix` → `https://api.example.com`, longest-prefix match wins
- **Admin UI** — dashboard with sidebar navigation (`/admin`), manage everything at runtime, no rebuilds or restarts
- **Realtime** — routes table and access-log tail update live (oRPC live queries over SSE); mutations from any client (UI, REST, MCP) push instantly
- **oRPC** — typed RPC API at `/rpc` for first-party clients; same auth + RBAC as REST
- **SSO** — one or more OIDC providers, per-provider login buttons
- **Users & roles** — RBAC with a permission matrix; custom roles
- **API keys** — programmatic access for scripts and agents
- **Access logs** — per-route request log with status and latency
- Single SQLite file, single container

## Quick start

```bash
docker run -d \
  --name pathbridge \
  -p 3000:3000 \
  -v pb-data:/data \
  ghcr.io/namhtpyn/pathbridge
```

Open `http://localhost:3000/admin` and sign in with the seeded admin:

- email `admin@pathbridge.local`
- password `pathbridge-admin`

Override `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first boot if you like.
The seed runs only on a fresh database — never on restarts.

Put your own TLS terminator (nginx, Traefik, Caddy…) in front; the app itself
is plain HTTP.

## Configuration

| env | default | purpose |
|---|---|---|
| `DATA_DIR` | `/data` | database location (mount a volume) |
| `PORT` | `3000` | listen port |
| `BETTER_AUTH_SECRET` | random | auth secret (set your own in production) |

Everything else — OIDC providers, roles, retention — is configured in the
admin UI at runtime.

### Forwarding

Add a route in the admin UI (or via `PUT /api/routes`):

```json
{ "path": "/hook", "target": "https://api.example.com" }
```

Requests to `/hook*` are proxied to `https://api.example.com*`. Optional
per-route settings: strip the prefix before forwarding, restrict HTTP methods,
override the upstream Host header, add a note, disable.

### oRPC (`/rpc`)

First-party typed RPC (built on [oRPC](https://orpc.dev)). The admin UI uses it
for all reads, including the live queries. Sessions and API keys authenticate
exactly like REST:

```
POST /rpc/routes/live        Authorization: Bearer <session token or API key>
{"json": {}}                 -> SSE stream of route snapshots
```

Procedures: `hello`, `me`, `routes.{list,count,live}`, `users.live`,
`roles.live`, `settings.get`, `oidc.list`, `keys.list`, `logs.{recent,tail}`.
Writes stay on `PUT/POST/DELETE /api/*` — both surfaces share one permission
model, so a scoped key narrows identically over REST, oRPC and MCP.

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
