# pathbridge — SPEC

Path → URL forwarding proxy with an admin UI. One binary (Nuxt 4 + Nitro), SQLite storage, better-auth identity.

## 1. Domain model

### Route
A mapping from a public path on this host to an upstream target origin.

| Field | Type | Rules |
|---|---|---|
| `id` | int autoincrement | stable identity for update/delete |
| `path` | string, unique, indexed | grammar below |
| `target` | http(s) URL | the destination URL — forwarded to VERBATIM for exact routes (a target path is the upstream path); for wildcard routes it is a prefix for the forwarded remainder; no query, no fragment |
| `upstreamHost` | string \| null | overrides `Host` header sent upstream |
| `methods` | string[] \| null | allowlist of HTTP verbs; null = all verbs |
| `note` | string \| null | ≤ 200 chars, free text |
| `enabled` | bool | disabled routes do not match |
| `userId` | string \| null | owner (RBAC `own` scope) |

**Path grammar**
- Exact: `/hook` — matches that path only.
- Wildcard: `/hook/*` — matches `/hook` and everything under it. `*` must be trailing; no mid-path wildcards.
- `/`, any `/admin*`, `/auth*`, `/health*`, `/mcp*`, `/rpc*` path is rejected by the schema (collides with app routes).
- Any path starting with `/_` is rejected outright (defensive namespace; the historical `/_api /_auth /_health` routes died in the admin rename).
- `/api`, `/mcp` and `/rpc` are in the middleware RESERVED list AND blocked by the schema (no silent shadowing).

**Forwarding**: EXACT routes forward to the target URL verbatim (the target's own path is the upstream path; the route path only selects). WILDCARD routes append the remainder after their base (`/zalo/*` + request `/zalo/oa/x` → upstream `/oa/x` relative to the target). Query string is NEVER touched.

**Method allowlist**: request verb not in `methods` → `405` with an `Allow` header. `null` = allow all.

### Role
Runtime-editable bundle of permissions. Row: `name` (2–32 chars, `[a-z0-9-]`, immutable), `description`, `statements` (JSON), `builtin` (bool).

Builtins: `admin` (everything `:all`) and `viewer` (`routes: read:own` only), canonicalized at boot (tamper-resistant; drifted rows reset to compiled-in definitions). Builtin rows cannot be edited or deleted; custom roles are fully editable.

**Statement grammar**: `"action:scope"` where action ∈ `create|read|update|delete` and scope ∈ `all|own`.
- `all` = act on anyone's records; implies the matching `own`.
- `own` = only records where `routes.userId` is the caller.
- Resources without ownership (`settings`, `users`, `roles`) only ever carry `:all`.
- Vocabulary is COMPILE-TIME (`STATEMENTS` in `server/lib/permissions.ts`; resources: routes, logs, settings, users, roles, keys, profile); a statement exists only if a route checks it. Runtime roles may only pick from it. Adding a statement = adding its enforcement in the same release.

**Resolution**: `user.role` is a comma-joined list of role names; effective grants = union of all role statements. Unknown role names are ignored. Changing a role takes effect on the next request (no cache, no restart).

**Assignment**: user create/update accepts `role`; assigning any role requires `roles:update`. Deleting a role still assigned → 409. Last-admin lockout: cannot delete yourself.

### User
better-auth email+password and/or OIDC (multiple providers). `role` column defaults `viewer`.

- **Password sign-up**: first user claims the instance (sign-up closes after; enforced at the `/auth/sign-up/email` route, NOT a DB hook — a hook would also kill OIDC first logins) and is promoted to `admin`.
- **Seeded admin**: a fresh database (no users) seeds `ADMIN_EMAIL` (default `admin@pathbridge.local`) and `ADMIN_PASSWORD` — with no `ADMIN_PASSWORD` set, a random one-time password is generated and printed ONCE to the boot log (never a guessable default). Skipped entirely once any user exists.
- **emailVerified**: Pathbridge has no email-verification flow, so boot canonicalizes every user with a credential account to `email_verified=1` (better-auth account linking requires it). Add/edit user modals expose the flag.
- **OIDC**: same-email logins auto-link to the existing verified local account (never duplicate). Configured provider ids are declared `trustedProviders` for account linking (custom generic-oauth providers are not in better-auth's builtin trusted list; without this, linking needs an `email_verified` IdP claim many providers omit).

### API key
Long-lived bearer credential (`@better-auth/api-key`), stored hashed, shown once at creation.

- **Default: inherits the owner's effective permissions** (unscoped key = acts as its owner).
- **Optional narrowing**: a key may carry `permissions` (same `resource -> [action:scope]` grammar as roles). The effective grants are the INTERSECTION of key statements and owner grants — a key can never expand beyond its owner, and can only shrink. Enforced centrally in `requireUser`.
- Rate limit disabled per key (the plugin's 10/day default silently 401'd at request #11); revocable; optional expiry.
- Managed via the `keys` oRPC procedures (`keys.{list,create,revoke}` — permissions are server-only on the plugin, so creation goes through our route, never the raw better-auth endpoint). UI: Profile modal → API keys (scope editor = same grouped permission matrix as roles, filtered to statements the owner holds).

### Access log
Fire-and-forget insert per proxied request: ts, method, path, routeId, status, durationMs, clientIp, userAgent. Logging can NEVER break proxying (failures swallowed). Retention sweeper every 6h deletes entries older than `logRetentionDays`; `0` = keep forever.

## 2. Auth surface

| Method | How |
|---|---|
| Session cookie | `better-auth.session_token` (`__Secure-` prefix on https) |
| Bearer session-token | `Authorization: Bearer <token from sign-in response body>` |
| Bearer API key | `Authorization: Bearer pb…` (no dot in token → API-key path) |

Every authed `/rpc` procedure (except the public `authConfig` and `version`) enforces session → resolve permissions → 403 with the missing permission named in the message.

IDs: uuidv7 everywhere (`advanced.database.generateId` + our own insert paths) — time-ordered, b-tree-friendly. The relations-v2 drizzle adapter runs with `advanced.database.joins: true` (single-query session fetches).

OIDC: MULTIPLE providers, runtime-configurable in Settings (JSON registry in the settings table; lazy migration of the legacy single-provider keys into provider id `oidc`). New provider ids are autogenerated UUIDs (slug ids grandfathered). Discovery runs at auth build; the auth instance is a lazy rebuildable singleton — registry writes rebuild it. `disablePasswordLogin` is rejected unless at least one provider is fully configured.

### oRPC surface (`/rpc`, `server/domains/` + `server/domains/app.router.ts`) — the Admin Panel transport

Self-service profile endpoints (`/auth/get-session`, `/auth/update-user`,
`/auth/change-password`) are permission-gated in the auth route wrapper:
resource `profile`, statements `read:own` / `update:own` (no `:all` —
admin user management stays under `users:*`). Viewer and admin both ship
the statements; custom roles grant them explicitly.

The Admin Panel — and every other client, scripting included — talks ONLY to
oRPC procedures at `POST /rpc/<path>` (wire: `{"json": <input>}`; better-auth
`/auth/*` endpoints excepted). There is NO REST `/api/*` surface: the last
REST handlers were removed in v5.2.0 and `/api` stays a reserved, non-proxyable
namespace. Procedures: `authConfig`, `version`, `session`,
`me`, `routes.{list,live,count,save,remove}`, `logs.{recent,tail}`,
`users.{live,list,save,update,setPassword,remove}`, `roles.{live,list,save,update,remove}`,
`settings.{get,save}`, `oidc.{list,save}`, `keys.{list,create,rename,revoke}` (rename: own keys only, 1–64 chars).
Test layout: `test/{unit,nuxt,e2e}` per the Nuxt 4 `test/` directory
convention (unit = fast vitest-on-bun, nuxt = @nuxt/test-utils env,
e2e = Playwright against the built artifact).
SSR data flow (vue-query): the plugin dehydrates the server QueryClient into
the nuxt payload and hydrates on the client (TanStack vue-query SSR guide);
`/admin` and `/admin/logs` await their conventional query in
`onServerPrefetch` so the server HTML carries the rows. The SSE tail is never
prefetched server-side (a stream in server render deadlocks behind nginx).
Realtime rule (enforced repo-wide): SSE live queries UPDATE pages after load —
they never carry initial data. Every view's first paint (incl. SSR) comes from a
conventional query procedure (`routes.list`, `logs.recent`); `.live`/`.tail`
subscribe on top. `logs.tail` therefore needs NO payload: the stream carries
DELTAS ONLY (rows newer than its subscribe-time own-scope cursor, highest id at
connect). A dropped/reconnected stream never re-sends a window — the client
reconciles by refetching `logs.recent`; pages reconcile late changes via their
own query refetch.
Row-level rules: own-scope filtering on routes/logs reads,
`requireRecordPermission` on writes (upsert-by-path requires UPDATE on the
existing record — create alone cannot repoint someone else's route), API-key
permission narrowing applies on every procedure. `routes.save` validates
through the strict zod schema in route-schema.ts. Scripts/agents auth with a
Bearer API key (same narrowing) — the e2e suite exercises this wire
end-to-end.

## 3. Proxy pipeline (`server/middleware/bridge.ts`)

1. Path reserved (`/auth /health /api /admin /mcp /rpc`) → skip (app handles).
2. `/` → 302 `/admin`.
3. Find matching route: exact match wins; else longest wildcard base; else 404.
4. `enabled=false` → treated as absent.
5. Method allowlist → 405 + `Allow`.
6. strip prefix if configured; forward method/headers/body; set upstream Host if configured; NEVER follow the client's `Host`.
7. Log fire-and-forget.

## 4. API contract (all JSON over `/rpc`)

The oRPC wire is the ONLY API (see §2 for the procedure list and rules):
`POST /rpc/<dotted-path-as-slashes>` with body `{"json": <input>}` —
e.g. `POST /rpc/routes/save` `{"json":{"path":"/hook","target":"https://x"}}`.
Errors are ORPCError codes (UNAUTHORIZED/FORBIDDEN/NOT_FOUND/BAD_REQUEST/CONFLICT)
with the missing permission named in `message`. `/api/*` returns 404 — the
namespace is reserved (non-proxyable) to keep old links from silently becoming
proxy targets.
- `GET /health` — liveness (always 200, no dependencies)
- `GET /health/ready` — readiness: liveness + `select 1` against the database (the bridge re-queries routes per request, so a dead DB = broken forwarding). Container HEALTHCHECK probes this every 30s (bun fetch — the runtime image ships no curl)
- **Bun idle timeout is forced in code (default 255s).** Bun's server idleTimeout defaults to 10s and is NOT reset by stream writes, so SSE live queries (15s keepalive) abort mid-stream on a default deployment. The bun preset entry reads `NITRO_BUN_IDLE_TIMEOUT` at boot; a `compiled` hook in `nuxt.config.ts` patches the built entry to `|| 255` so the app is safe out of the box — an explicit env value still overrides. If the hook ever warns that its needle vanished, the nitro preset template changed and the patch must be re-derived.
- `POST|GET|DELETE /mcp` — MCP server (streamable HTTP, stateless; Bearer API key or session). Tools: `list_routes`, `create_route`, `update_route`, `delete_route`, `get_logs` — same zod schemas and permission enforcement as the oRPC procedures (key narrowing applies per tool call).
- `POST /rpc/*` — oRPC router (Fetch adapter at `server/routes/rpc/[...].ts`). Procedures: `authConfig`, `version`, `session`, `me`, `routes.{list,live,count,save,remove}`, `users.{list,live,save,update,setPassword,remove}`, `roles.{list,live,save,update,remove}`, `settings.{get,save}`, `oidc.{list,save}`, `keys.{list,create,rename,revoke}`, `logs.{recent,tail}`. Bodies are wrapped (`{"json": <input>}`); live procedures stream snapshots as SSE (AsyncIteratorObject handlers backed by the in-process change bus). Auth = identical requireUser path (cookie session or Bearer API key, narrowing included) — no oRPC-specific privilege logic.

### Realtime (change bus + live queries)

Every write path (all REST mutation handlers, the three MCP route tools, access-log insert) publishes `publishChange(resource, action)` to an in-process MemoryPublisher (`server/lib/change-bus.ts`; buffer 100). Live procedures (`routes.live`, `logs.tail`, `users.live`, `roles.live`) yield an initial snapshot, then re-emit a fresh snapshot when a relevant event fires — delivered as SSE by the RPCHandler. Streams are CONNECTION-SCOPED: the /rpc handler aborts an AbortController on `res.close` and every generator pulls through it, so a disconnected client's bus listener and keepalive die immediately (a leak here re-queries per proxied request). `liveGenerator` subscribes BEFORE its snapshot and coalesces the subscribe-window backlog into one extra frame (no lost changes). `logs.recent` returns `{ entries, latestId }`; the client refetches it on every (re)connect so rows committed between snapshot and subscribe are reconciled even though the payload-free tail can never re-send them. The admin UI subscribes via `@orpc/tanstack-query` `liveOptions()`; mutations from ANY surface (UI, REST, MCP, proxied traffic for logs) push within ~2s without reload.

Errors: zod strict validation → 400 with `field: message`; permission → 403 `Forbidden: missing permission resource:action`; auth → 401.

**Validation law**: backend re-validates EVERYTHING with `z.strictObject` (rejects unknown keys, nulls, untrimmed values). Frontend schemas are loose + transforming (accept undefined/null/''/string, trim, drop empties) purely for UX; they are never a security boundary.

Access-log status semantics: a forwarded request logs the upstream status; an upstream connect failure logs `502`; a CLIENT abort mid-proxy logs `499` (so aborted downloads never read as upstream outages). Retention purges run in 5k-row batches to keep SQLite's single writer available, and the sweeper timers are released on app close.

Keys: `keys.create` trims the name and returns the new key's `id`; a scoped key's permissions are validated against the vocabulary AND the caller's own grants at request time (a key can never be minted with grants its owner lacks). OIDC: `oidc.save` rejects a supplied-but-unknown provider id (`unknown provider id: …`) instead of silently re-registering it under a new callback path.

## 5. Upgrade semantics

Migrations auto-apply at boot from `./drizzle` (tracked in `__migrations`).
**They are HAND-WRITTEN — never run `drizzle-kit generate/push/pull` against this repo.** The migration folders are the DDL source of truth (`schema.ts` declares the runtime shape); the runner applies each folder atomically (BEGIN → statements → journal row → COMMIT), runs `PRAGMA` chunks outside the transaction, and CI replays every folder into a fresh DB and boots against it. Snapshot files were removed because a stale chain makes `generate` emit destructive table re-creates. Pre-RBAC databases: existing user is promoted to `admin` and unowned routes backfilled to them (the implicit-admin invariant).

## 6. Invariants (never break)

1. Proxying never depends on auth or logging succeeding.
2. Backend is the only trust boundary; UI gating is cosmetic.
3. Statements vocabulary changes ship WITH their enforcement.
4. API keys can never exceed their owner's permissions (intersection, enforced in requireUser).
5. First-user-claims gate stays closed after the first user (password sign-up route only; OIDC first login still creates its user).
6. Fresh-instance seeding only: the default admin is created exactly when no users exist, never on restarts with users.
7. MCP tool calls go through the identical auth + permission path as REST — no MCP-specific privilege logic exists.
7b. oRPC procedures use the same requireUser path too; a live query is permission-checked per subscription exactly like its REST read.
7c. Live-query correctness = every mutation publishes; a write path that forgets publishChange breaks realtime (the logs insert once did).
8. Builtin roles are canonicalized at boot; drift heals.

## Auth schema provenance

## Backend feature-module structure (NestJS-style)

> The domain dir is `server/domains/`, NOT `server/modules/` — `modules` is a
> nitro magic scan-dir (auto-loaded as nitro modules) and breaks clean builds.

The /rpc surface is composed of domain modules under `server/domains/`:

    server/domains/
      shared/context.ts         ServerContext, buildServerContext, withUser/withPerm,
                                guardRecord, liveGenerator, vocabularyOut (shared middlewares)
      meta/meta.router.ts       authConfig, version, session, me
      routes/  routes.router.ts + routes.service.ts + routes.schema.ts (zod/strict boundary)
      logs/    logs.router.ts   + logs.service.ts + access-log.service.ts
      users/   users.router.ts  + users.service.ts    (createUser/updateUser/setPassword)
      roles/   roles.router.ts  + roles.service.ts
      settings/settings.router.ts + settings.service.ts
      oidc/    oidc.router.ts   + oidc.service.ts     (provider registry, secret redaction)
      keys/    keys.router.ts   + keys.service.ts
      app.router.ts             appRouter = os.router({...modules}) — mounted at /rpc
    server/lib/                 cross-cutting infra (NOT domain logic)
      auth.ts permissions.ts session.ts change-bus.ts once.ts mcp/tools.ts
    (server/utils/ no longer exists)

Conventions:
- `<domain>.router.ts` = procedures (parse → permission → service call). Thin.
- `<domain>.service.ts` = drizzle/domain logic, unit-testable without oRPC.
- Adding a domain = new module dir + one spread line in app.router.ts.
- Wire contract is pinned by the e2e suite; a module refactor must keep
  paths, error codes, and the {"json":{...}} envelope byte-identical.
- Lazy imports: routers/services must not statically import `server/db`
  (bun:sqlite) or anything that pulls it (lib/permissions, modules/users/users.service) —
  `nuxt prepare` runs jiti over Node and would fail to resolve bun:sqlite.
  Use `await import('...')` inside handlers/services.

The better-auth tables (user/session/account/verification/apikey) are kept in
sync with the better-auth CLI:

    bun run auth:schema

which regenerates `server/db/schema.auth.ts` — THE source of truth
for the auth tables (relations-v2 output: `defineRelationsPart` +
`authRelations`). `server/db/schema.ts` imports and re-exports the generated tables and adds only app tables (`routes`, `settings`, `access_log`, `roles`)
plus app relations. The config bridge (`scripts/auth-cli.config.ts`) uses the
SAME plugins and the same `@better-auth/drizzle-adapter/relations-v2` adapter
as the runtime. Never pass `--adapter drizzle` on the CLI — it overrides the
config adapter with the mock v1 generator (v1 `relations()` output).

Column modes are `timestamp_ms` (CLI canonical). Existing rows stored epoch
seconds; migration `20261011120000_auth_timestamp_ms` converts them (guarded:
values < 10^12 are treated as seconds) and drops the legacy `apikey.user_id`
column. Regenerating that adds columns needs a matching data migration. Regenerate after any better-auth/plugin
upgrade and diff against `server/db/schema.ts`; adopt new columns/indexes via
a drizzle migration. Deliberate divergences (documented in the schema header):
`timestamp` seconds mode (existing data), `emailVerified` defaults true,
legacy `apikey.user_id`, no `$onUpdate` hooks. Adopted from the CLI reference
in 20261011090000_auth_indexes: 6 lookup indexes + FK delete cascades
(declared in schema; user deletion already cascades in `users.remove`).

## Testing

- Unit (`bun run test:unit`, vitest-on-bun): pure logic — bridge matching laws
  (pinned against `server/middleware/bridge.ts` source), `routeInputSchema`
  strictness (reserved paths incl. `/api`, trailing-wildcard shape, hop-by-hop
  header-override denial, injection/CRLF caps), `userCan` scope algebra
  (`all ⊃ own`, never inverse), `validateStatements` vocabulary enforcement,
  OIDC provider-id + secret-redaction guards.
- E2E (`bun run test:e2e`, Playwright; `desktop` + `mobile` 390px projects):
  built app on :4310 with a deterministic upstream on :4311. Covers public
  probes, 401 gates, `{"json": input}` oRPC wire, session/me contracts, route
  lifecycle, the H1 upsert-by-path takeover guard (create-only role gets
  FORBIDDEN on another's path), scoped-key narrowing + revocation, proxy
  forwarding + access-log recording, admin UI (login/logout, CRUD via modal,
  live-query updates without reload, per-page render, no horizontal scroll at
  390px).
- e2e server env: NO `BETTER_AUTH_URL` (origin derived per request; the strict
  origin check would reject Playwright's origin-less API-context POSTs),
  `BETTER_AUTH_TRUSTED_ORIGINS` covers `localhost` (PW pages send Origin).
