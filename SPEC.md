# pathbridge — SPEC

Path → URL forwarding proxy with an admin UI. One binary (Nuxt 4 + Nitro), SQLite storage, better-auth identity.

## 1. Domain model

### Pair
A mapping from a public path on this host to an upstream target origin.

| Field | Type | Rules |
|---|---|---|
| `id` | int autoincrement | stable identity for update/delete |
| `path` | string, unique, indexed | grammar below |
| `target` | http(s) origin | scheme + host [+ port] ONLY — no path, no query |
| `upstreamHost` | string \| null | overrides `Host` header sent upstream |
| `stripPrefix` | bool | wildcard pairs only |
| `methods` | string[] \| null | allowlist of HTTP verbs; null = all verbs |
| `note` | string \| null | ≤ 200 chars, free text |
| `enabled` | bool | disabled pairs do not match |
| `userId` | string \| null | owner (RBAC `own` scope) |

**Path grammar**
- Exact: `/hook` — matches that path only.
- Wildcard: `/hook/*` — matches `/hook` and everything under it. `*` must be trailing; no mid-path wildcards.
- `/` and any `/admin*` path are RESERVED and rejected by the schema.
- Reserved prefixes (unclaimable, served by the app): `/_api /_auth /_health /api /admin` (historical underscore forms are rejected too).

**stripPrefix** (wildcard-only): off = forward the full original path; on = remove the pair's base (`/zalo/oa/x` → upstream `/oa/x`). Query string is NEVER touched.

**Method allowlist**: request verb not in `methods` → `405` with an `Allow` header. `null` = allow all.

### Role
Runtime-editable bundle of permissions. Row: `name` (2–32 chars, `[a-z0-9-]`, immutable), `description`, `statements` (JSON), `builtin` (bool).

Builtins seeded at boot (idempotent): `admin` (everything), `operator` (own pairs CRUD + own logs read), `viewer` (own pairs/logs read). Builtins cannot be edited or deleted.

**Statement grammar**: `"action:scope"` where action ∈ `create|read|update|delete` and scope ∈ `all|own`.
- `all` = act on anyone's records; implies the matching `own`.
- `own` = only records where `pairs.userId` is the caller.
- Resources without ownership (`settings`, `users`, `roles`) only ever carry `:all`.
- Vocabulary is COMPILE-TIME (`STATEMENTS` in `server/utils/permissions.ts`); a statement exists only if a route checks it. Runtime roles may only pick from it. Adding a statement = adding its enforcement in the same release.

**Resolution**: `user.role` is a comma-joined list of role names; effective grants = union of all role statements. Unknown role names are ignored. Changing a role takes effect on the next request (no cache, no restart).

**Assignment**: user create/update accepts `role`; assigning any role requires `roles:update`. Deleting a role still assigned → 409. Last-admin lockout: cannot delete yourself.

### User
better-auth email+password (or OIDC when configured). `role` column defaults `viewer`. **First user to sign up claims the instance** (sign-up closes afterwards) and is promoted to `admin`. Admin-created users get explicit roles.

### API key
Long-lived bearer credential (`@better-auth/api-key`). Prefix `pb`. Inherits the OWNER's effective permissions — never broader. Rate-limit 10 req/day per key by default; revocable; optional expiry. Created/managed at `/auth/api-key/*` (create/list/update/delete/verify).

### Access log
Fire-and-forget insert per proxied request: ts, method, path, pairId, status, durationMs, clientIp, userAgent. Logging can NEVER break proxying (failures swallowed). Retention sweeper every 6h deletes entries older than `logRetentionDays`; `0` = keep forever.

## 2. Auth surface

| Method | How |
|---|---|
| Session cookie | `better-auth.session_token` (`__Secure-` prefix on https) |
| Bearer session-token | `Authorization: Bearer <token from sign-in response body>` |
| Bearer API key | `Authorization: Bearer pb…` (no dot in token → API-key path) |

All `/api/*` routes (except `/api/auth-config`, `/api/me` requires auth) enforce session → resolve permissions → 403 with the missing permission named in the message.

OIDC: runtime-configurable via Settings (issuer/clientId/clientSecret). Discovery runs at auth build; the auth instance is a lazy rebuildable singleton — Settings writes rebuild it; DB-backed sessions survive. `disablePasswordLogin` is rejected unless OIDC is configured.

## 3. Proxy pipeline (`server/middleware/bridge.ts`)

1. Path reserved (`/_api /_auth /_health /api /admin`) → skip (app handles).
2. `/` → 302 `/admin`.
3. Find matching pair: exact match wins; else longest wildcard base; else 404.
4. `enabled=false` → treated as absent.
5. Method allowlist → 405 + `Allow`.
6. strip prefix if configured; forward method/headers/body; set upstream Host if configured; NEVER follow the client's `Host`.
7. Log fire-and-forget.

## 4. API contract (all JSON)

- `GET /api/pairs` → own-scope filtered by read scope
- `PUT /api/pairs` — upsert; `id` present = update-in-place (404 gone, 409 path clash); absent = create (ownership set to caller)
- `DELETE /api/pairs/:id`
- `GET /api/logs?limit&pairId&beforeId` — cursor paging; own = logs of own pairs only
- `GET/PUT /api/settings` — oidc config, disablePasswordLogin, logRetentionDays
- `GET/POST /api/users`, `PUT/DELETE /api/users/:id`, `PUT /api/users/:id/password`
- `GET /api/roles` (+vocabulary), `POST /api/roles`, `GET/PUT/DELETE /api/roles/:id`
- `GET /api/me` — user + resolved permissions + vocabulary (drives UI gating)
- `GET /api/auth-config` — public; login page needs it
- `GET /health` — liveness

Errors: zod strict validation → 400 with `field: message`; permission → 403 `Forbidden: missing permission resource:action`; auth → 401.

**Validation law**: backend re-validates EVERYTHING with `z.strictObject` (rejects unknown keys, nulls, untrimmed values). Frontend schemas are loose + transforming (accept undefined/null/''/string, trim, drop empties) purely for UX; they are never a security boundary.

## 5. Upgrade semantics

Migrations auto-apply at boot from `./drizzle` (tracked in `__migrations`). Pre-RBAC databases: existing user is promoted to `admin` and unowned pairs backfilled to them (the implicit-admin invariant).

## 6. Invariants (never break)

1. Proxying never depends on auth or logging succeeding.
2. Backend is the only trust boundary; UI gating is cosmetic.
3. Statements vocabulary changes ship WITH their enforcement.
4. API keys can never exceed their owner's permissions.
5. First-user-claims gate stays closed after the first user.
6. No seeded credentials; no default account.
