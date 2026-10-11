# AGENTS.md — pathbridge repo rules for AI agents

## Docs are part of the change — ALWAYS up to date

**Every functional change ships with matching docs in the SAME commit.** Stale docs count as shipped bugs. Before opening a PR / pushing:

1. `README.md` — user-facing behavior (features, endpoints, env, quick start)
2. `SPEC.md` — invariants, domain model, API contract (REST + oRPC + MCP), upgrade semantics
3. `DESIGN_SYSTEM.md` — UI laws (components, forms, tables, modals, mobile)

If you add/rename/remove an endpoint, procedure, field, env var, permission, or UI convention, update the corresponding doc section in the same commit — then re-read the touched sections and check every claim against the actual code. If a doc names something that no longer exists (`grep` it), that is a bug: fix it or revert the claim. A release with drifted docs is not done.

## Standing conventions (enforced, docs expand on these)

- Admin Panel uses oRPC procedures at `/rpc` exclusively; better-auth `/auth/*` excepted. Never add `$fetch('/api/...')` to `app/`.
- Modal action buttons live in the modal's `#footer` slot (submit buttons associate via the `form` attribute when the form stays in `#body`).
- Backend re-validates everything with strict zod; frontend validation is UX only.
- Verify before commit: typecheck + build + browser E2E (desktop AND 390px mobile) — probe the artifact, never trust recall.
- bun-only toolchain; dependencies pinned exact.
