# AGENTS.md — pathbridge repo rules for AI agents

## Docs are part of the change — ALWAYS up to date

**Every functional change ships with matching docs in the SAME commit.** Stale docs count as shipped bugs. Before opening a PR / pushing:

1. `README.md` — user-facing behavior (features, endpoints, env, quick start)
2. `SPEC.md` — invariants, domain model, API contract (REST + oRPC + MCP), upgrade semantics
3. `DESIGN_SYSTEM.md` — UI laws (components, forms, tables, modals, mobile)

**README.md audience law:** README is for people who INSTALL and USE pathbridge — not for
developers working on it. It documents what the app does, its endpoints/env/config, and how to
run it; it never contains internal architecture, refactor history, contributor workflow, or
developer-only notes (those belong in SPEC.md / AGENTS.md). When touching README: update it
with correct user-facing info ONLY, and keep it install-and-use shaped. No implementation
jargon — users don't care that the app is built on oRPC, better-auth, drizzle, Nitro etc.;
name the capability, not the library.

If you add/rename/remove an endpoint, procedure, field, env var, permission, or UI convention, update the corresponding doc section in the same commit — then re-read the touched sections and check every claim against the actual code. If a doc names something that no longer exists (`grep` it), that is a bug: fix it or revert the claim. A release with drifted docs is not done.

## Standing conventions (enforced, docs expand on these)

- Admin Panel uses oRPC procedures at `/rpc` exclusively; better-auth `/auth/*` excepted. Never add `$fetch('/api/...')` to `app/`.
- SSE/live queries UPDATE pages after load — they never carry the initial data. First page
  load (including SSR) always uses a conventional query procedure (`.recent`, `.list`, …);
  the live generator subscribes for changes on top of that. A page whose first paint waits
  on a stream is a bug. (Reconnect/reconciliation frames after the page is loaded are fine.)
- Modal action buttons live in the modal's `#footer` slot (submit buttons associate via the `form` attribute when the form stays in `#body`).
- Backend re-validates everything with strict zod; frontend validation is UX only.
- Verify before commit: typecheck + build + browser E2E (desktop AND 390px mobile) — probe the artifact, never trust recall.
- bun-only toolchain; dependencies pinned exact.
- Do NOT explicitly annotate return types unless absolutely necessary — let TypeScript
  infer them. Annotate returns only when inference is wrong/lossy (e.g. widening a
  union for a public API) or when a type annotation is load-bearing (type predicates,
  `satisfies`, generic constraints). Unnecessary `: SomeType` on returns is drift
  waiting to happen: the annotation silently goes stale when the body changes.

## Backend module structure
- NEVER name a server dir `modules/` — nitro auto-scans `<scanDir>/modules/**` as NITRO
  modules (magic dir) and jiti-imports every file in it; namespace exports without `setup`
  crash the clean-install build with `Attempted to assign to readonly property` (only
  reproduces on a FRESH node_modules — stale dev trees pass). Domain folders live in
  `server/domains/`.
- New admin domain = `server/domains/<domain>/` with `<domain>.router.ts` (thin procedures)
  and `<domain>.service.ts` (drizzle/domain logic); register it in `server/domains/app.router.ts`.
- Cross-cutting infra lives in `server/lib/` (auth, permissions, session, change-bus, mcp).
  `server/utils/` does not exist anymore — do not recreate it.
- Routers/services must LAZY-import (`await import`) anything reaching `server/db` —
  `nuxt prepare` (jiti/Node) cannot resolve `bun:sqlite` through static chains.
- NEVER start a statement line with `(await getDb()).` after an un-semicolon'd line — JS ASI
  glues it to the previous expression (bit us: `await hashPassword(p)` + next line `(...)`
  parsed as a call). Bind first: `const db = await getDb(); db.x(...)`.
