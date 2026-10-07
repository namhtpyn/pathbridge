# pathbridge — SPEC

Path → URL forwarding proxy with an admin UI. One binary (Nuxt 4 + Nitro), SQLite storage, better-auth identity.

## 1. Domain model

### Route
A mapping from a public path on this host to an upstream target origin.

| Field | Type | Rules |
|---|---|---|
| `id` | int autoincrement | stable identity for update/delete |
| `path` | string, unique, indexed | grammar below |
| `target` | http(s) URL | origin [+ port] with OPTIONAL base path (forwarded as path prefix); no query, no fragment |
| `upstreamHost` | string \| null | overrides `Host` header sent upstream |
| `stripPrefix` | bool | wildcard routes only |
| `methods` | string[] \| null | allowlist of HTTP verbs; null = all verbs |
| `note` | string \| null | ≤ 200 chars, free text |
| `enabled` | bool | disabled routes do not match |
| `userId` | string \| null | owner (RBAC `own` scope) |

**Path grammar**
- Exact: `/hook` — matches that path only.
- Wildcard: `/hook/*` — matches `/hook` and everything under it. `*` must be trailing; no mid-path wildcards.
- `/`, any `/admin*`, `/auth*`, `/health*`, `/mcp*` path is rejected by the schema (collides with app routes).
- Any path starting with `/_` is rejected outright (defensive namespace; the historical `/_api /_auth /_health` routes died in the admin rename).
- `/api` and `/mcp` are in the middleware RESERVED list AND blocked by the schema (no silent shadowing).

**stripPrefix** (wildcard-only): off = forward the full original path; on = remove the route's base (`/zalo/oa/x` → upstream `/oa/x`). Query string is NEVER touched.

**Method allowlist**: request verb not in `methods` → `405` with an `Allow` header. `null` = allow all.

### Role
Runtime-editable bundle of permissions. Row: `name` (2–32 chars, `[a-z0-9-]`, immutable), `description`, `statements` (JSON), `builtin` (bool).

Builtins: `admin` (everything `:all`) and `viewer` (`routes: read:own` only), canonicalized at boot (tamper-resistant; drifted rows reset to compiled-in definitions). Builtin rows cannot be edited or deleted; custom roles are fully editable.

**Statement grammar**: `"action:scope"` where action ∈ `create|read|update|delete` and scope ∈ `all|own`.
- `all` = act on anyone's records; implies the matching `own`.
- `own` = only records where `routes.userId` is the caller.
- Resources without ownership (`settings`, `users`, `roles`) only ever carry `:all`.
- Vocabulary is COMPILE-TIME (`STATEMENTS` in `server/utils/permissions.ts`); a statement exists only if a route checks it. Runtime roles may only pick from it. Adding a statement = adding its enforcement in the same release.

**Resolution**: `user.role` is a comma-joined list of role names; effective grants = union of all role statements. Unknown role names are ignored. Changing a role takes effect on the next request (no cache, no restart).

**Assignment**: user create/update accepts `role`; assigning any role requires `roles:update`. Deleting a role still assigned → 409. Last-admin lockout: cannot delete yourself.

### User
better-auth email+password and/or OIDC (multiple providers). `role` column defaults `viewer`.

- **Password sign-up**: first user claims the instance (sign-up closes after; enforced at the `/auth/sign-up/email` route, NOT a DB hook — a hook would also kill OIDC first logins) and is promoted to `admin`.
- **Seeded admin**: a fresh database (no users) seeds `ADMIN_EMAIL`/`ADMIN_PASSWORD` (defaults `admin@pathbridge.local` / `pathbridge-admin`) at boot; skipped entirely once any user exists.
- **emailVerified**: Pathbridge has no email-verification flow, so boot canonicalizes every user with a credential account to `email_verified=1` (better-auth account linking requires it). Add/edit user modals expose the flag.
- **OIDC**: same-email logins auto-link to the existing verified local account (never duplicate). Configured provider ids are declared `trustedProviders` for account linking (custom generic-oauth providers are not in better-auth's builtin trusted list; without this, linking needs an `email_verified` IdP claim many providers omit).

### API key
Long-lived bearer credential (`@better-auth/api-key`), stored hashed, shown once at creation.

- **Default: inherits the owner's effective permissions** (unscoped key = acts as its owner).
- **Optional narrowing**: a key may carry `permissions` (same `resource -> [action:scope]` grammar as roles). The effective grants are the INTERSECTION of key statements and owner grants — a key can never expand beyond its owner, and can only shrink. Enforced centrally in `requireUser`.
- Rate limit disabled per key (the plugin's 10/day default silently 401'd at request #11); revocable; optional expiry.
- Managed via `/api/keys` (create/list/delete — permissions are server-only on the plugin, so creation goes through our route, never the raw better-auth endpoint). UI: Profile modal → API keys (scope editor = same grouped permission matrix as roles, filtered to statements the owner holds).

### Access log
Fire-and-forget insert per proxied request: ts, method, path, routeId, status, durationMs, clientIp, userAgent. Logging can NEVER break proxying (failures swallowed). Retention sweeper every 6h deletes entries older than `logRetentionDays`; `0` = keep forever.

## 2. Auth surface

| Method | How |
|---|---|
| Session cookie | `better-auth.session_token` (`__Secure-` prefix on https) |
| Bearer session-token | `Authorization: Bearer <token from sign-in response body>` |
| Bearer API key | `Authorization: Bearer pb…` (no dot in token → API-key path) |

All `/api/*` routes (except `/api/auth-config`, `/api/me` requires auth) enforce session → resolve permissions → 403 with the missing permission named in the message.

OIDC: MULTIPLE providers, runtime-configurable in Settings (JSON registry in the settings table; lazy migration of the legacy single-provider keys into provider id `oidc`). New provider ids are autogenerated UUIDs (slug ids grandfathered). Discovery runs at auth build; the auth instance is a lazy rebuildable singleton — registry writes rebuild it. `disablePasswordLogin` is rejected unless at least one provider is fully configured.

## 3. Proxy pipeline (`server/middleware/bridge.ts`)

1. Path reserved (`/auth /health /api /admin /mcp`) → skip (app handles).
2. `/` → 302 `/admin`.
3. Find matching route: exact match wins; else longest wildcard base; else 404.
4. `enabled=false` → treated as absent.
5. Method allowlist → 405 + `Allow`.
6. strip prefix if configured; forward method/headers/body; set upstream Host if configured; NEVER follow the client's `Host`.
7. Log fire-and-forget.

## 4. API contract (all JSON)

- `GET /api/routes` → own-scope filtered by read scope
- `PUT /api/routes` — upsert; `id` present = update-in-place (404 gone, 409 path clash); absent = create (ownership set to caller)
- `DELETE /api/routes/:id`
- `GET /api/logs?limit&routeId&beforeId` — cursor paging; own = logs of own routes only
- `GET/PUT /api/settings` — oidc config, disablePasswordLogin, logRetentionDays
- `GET/POST /api/users`, `PUT/DELETE /api/users/:id`, `PUT /api/users/:id/password`
- `GET /api/roles` (+vocabulary), `POST /api/roles`, `GET/PUT/DELETE /api/roles/:id`
- `GET /api/me` — user + resolved permissions + vocabulary (drives UI gating)
- `GET /api/auth-config` — public; login buttons for the login screen
- `GET/PUT /api/oidc` — multi-provider registry (secrets write-only; blank-on-edit keeps stored)
- `GET/POST /api/keys`, `DELETE /api/keys/:id` — own API keys only
- `GET /api/version` — build version (baked `APP_VERSION`)
- `GET /health` — liveness
- `POST|GET|DELETE /mcp` — MCP server (streamable HTTP, stateless; Bearer API key or session). Tools: `list_routes`, `create_route`, `update_route`, `delete_route`, `get_logs` — same zod schemas and permission enforcement as REST (key narrowing applies per tool call).

Errors: zod strict validation → 400 with `field: message`; permission → 403 `Forbidden: missing permission resource:action`; auth → 401.

**Validation law**: backend re-validates EVERYTHING with `z.strictObject` (rejects unknown keys, nulls, untrimmed values). Frontend schemas are loose + transforming (accept undefined/null/''/string, trim, drop empties) purely for UX; they are never a security boundary.

## 5. Upgrade semantics

Migrations auto-apply at boot from `./drizzle` (tracked in `__migrations`). Pre-RBAC databases: existing user is promoted to `admin` and unowned routes backfilled to them (the implicit-admin invariant).

## 6. Invariants (never break)

1. Proxying never depends on auth or logging succeeding.
2. Backend is the only trust boundary; UI gating is cosmetic.
3. Statements vocabulary changes ship WITH their enforcement.
4. API keys can never exceed their owner's permissions (intersection, enforced in requireUser).
5. First-user-claims gate stays closed after the first user (password sign-up route only; OIDC first login still creates its user).
6. Fresh-instance seeding only: the default admin is created exactly when no users exist, never on restarts with users.
7. MCP tool calls go through the identical auth + permission path as REST — no MCP-specific privilege logic exists.
8. Builtin roles are canonicalized at boot; drift heals.
