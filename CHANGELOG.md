# [5.1.0](https://github.com/namhtpyn/pathbridge/compare/v5.0.1...v5.1.0) (2026-10-11)


### Features

* **health:** readiness endpoint + container HEALTHCHECK ([6c54c4d](https://github.com/namhtpyn/pathbridge/commit/6c54c4da8c7bc9ba03193dc6e6772c02f8b00673))

## [5.0.1](https://github.com/namhtpyn/pathbridge/compare/v5.0.0...v5.0.1) (2026-10-11)


### Bug Fixes

* **ssr:** call oRPC procedures in-process during SSR via createRouterClient ([df84a04](https://github.com/namhtpyn/pathbridge/commit/df84a047e4c18aca10275821402563e2caa82643))

# [5.0.0](https://github.com/namhtpyn/pathbridge/compare/v4.0.0...v5.0.0) (2026-10-11)


### Features

* **admin:** admin panel uses oRPC procedures exclusively — REST /api twins removed from UI ([22ebe4f](https://github.com/namhtpyn/pathbridge/commit/22ebe4f2a083e3e6b17fa796f37bda302c4857c7))


### BREAKING CHANGES

* **admin:** admin panel uses oRPC procedures exclusively — REST /api twins removed from UI

# [4.0.0](https://github.com/namhtpyn/pathbridge/compare/v3.1.5...v4.0.0) (2026-10-08)


### Features

* **routes:** replace host override with request/response header overrides ([e2754d7](https://github.com/namhtpyn/pathbridge/commit/e2754d78cd5b6328b5178ed469bafdef3ffc237b))


### BREAKING CHANGES

* **routes:** route.upstreamHost is gone. Use requestHeaders with
{ name: 'host', op: 'set', value } instead — migration rewrites existing
rows automatically.

- routes gain requestHeaders + responseHeaders: ordered lists of
  { name, op: set|remove, value? } (max 20/direction, names lowercased,
  duplicates rejected, hop-by-hop/framing headers denied by zod).
- request overrides: set rides proxyRequest opts.headers (wins over the
  client's); remove strips the header from the incoming event BEFORE
  the proxy copies client headers.
- response overrides: applied in onResponse after upstream headers are
  copied — remove strips upstream fingerprints, set injects CORS /
  cache-control / security headers per route.
- boot migration 20261009060000: upstream_host -> request_headers JSON,
  column dropped (pre-1.0 clean break).
- UI: shared HeaderRowsEditor component (name / set|remove / value? / X
  rows, tooltips, 20-row cap) in both sections; modal widened to
  max-w-xl; Host override discoverable via the section hint popover.
- shared/types + REST PUT + MCP create/update tools accept the lists;
  access log never stores override values (injected auth stays secret).

Verified E2E on a live echo upstream: request set/remove, response
set/remove, host equivalence, migration rewrite, zod rejections
(hop-by-hop, duplicate, set-without-value), UI add/edit/remove/op-switch
round-trip on desktop + 390px mobile.

## [3.1.5](https://github.com/namhtpyn/pathbridge/compare/v3.1.4...v3.1.5) (2026-10-08)


### Bug Fixes

* **release:** allow + in commit header scope — 'fix(ui+ci):' parsed typeless and cut no release ([8113a22](https://github.com/namhtpyn/pathbridge/commit/8113a22dec3d1af0f7a99cba84478c38a4c31b3d))
* **ui+ci:** finger-friendly mobile sidebar nav; CI workflow off npm onto bun ([e96f993](https://github.com/namhtpyn/pathbridge/commit/e96f99393541d429abc8a3d6d2e971191471ddf7))

## [3.1.4](https://github.com/namhtpyn/pathbridge/compare/v3.1.3...v3.1.4) (2026-10-08)


### Bug Fixes

* **ts:** auth-session cookie guard — TS2769 on the && short-circuit statement (caught by CI on fresh checkout; local .nuxt types were stale) ([604eb24](https://github.com/namhtpyn/pathbridge/commit/604eb24868de09dd2cca464ea104a86d3e542629))
* **ui:** mobile double padding — UDashboardPanel body p-4 sm:p-6 stacked with the layout's own padding wrapper ([cc0414d](https://github.com/namhtpyn/pathbridge/commit/cc0414d9d88d18ade67261d92cb273111519c97e))

## [3.1.3](https://github.com/namhtpyn/pathbridge/compare/v3.1.2...v3.1.3) (2026-10-08)


### Bug Fixes

* **ui:** logs page Load-more dead click + stale sidebar count + duplicate mobile sidebar toggle ([06e72db](https://github.com/namhtpyn/pathbridge/commit/06e72db0a60a91041f708faa622b699c4bdb657a))

## [3.1.2](https://github.com/namhtpyn/pathbridge/compare/v3.1.1...v3.1.2) (2026-10-08)


### Bug Fixes

* **ui:** logs page infinite spinner behind buffering proxies; settings table polish ([8a89f48](https://github.com/namhtpyn/pathbridge/commit/8a89f48104dc017eb9550159bab632b8c5c507fa))

## [3.1.1](https://github.com/namhtpyn/pathbridge/compare/v3.1.0...v3.1.1) (2026-10-08)


### Bug Fixes

* **ui:** settings page — split cards by concern, OIDC list as UTable ([4ade2c0](https://github.com/namhtpyn/pathbridge/commit/4ade2c08792e821358064bfd610cd264769a0cf3))

# [3.1.0](https://github.com/namhtpyn/pathbridge/compare/v3.0.0...v3.1.0) (2026-10-08)


### Features

* oRPC read surface + fix key revocation + docs sync ([b09bff4](https://github.com/namhtpyn/pathbridge/commit/b09bff4e00828e1ac2ca03375668696db3d53025))

# [3.0.0](https://github.com/namhtpyn/pathbridge/compare/v2.3.1...v3.0.0) (2026-10-08)


### Features

* admin redesign — dashboard shell, per-page sections, realtime tables ([a97a4b5](https://github.com/namhtpyn/pathbridge/commit/a97a4b51cd8bf482899a2f3beab995e0a0fde0a6))


### BREAKING CHANGES

* admin redesign — dashboard shell, per-page sections, realtime tables

## [2.3.1](https://github.com/namhtpyn/pathbridge/compare/v2.3.0...v2.3.1) (2026-10-08)


### Bug Fixes

* **realtime:** publish logs change event on access-log insert ([0d8e848](https://github.com/namhtpyn/pathbridge/commit/0d8e8488422d5ada86e48acf5f5267be36fbf939))

# [2.3.0](https://github.com/namhtpyn/pathbridge/compare/v2.2.0...v2.3.0) (2026-10-08)


### Features

* realtime layer — oRPC live queries over the change bus ([e01bb86](https://github.com/namhtpyn/pathbridge/commit/e01bb8681fa7dd70e60568c311bde47f08981f08))

# [2.2.0](https://github.com/namhtpyn/pathbridge/compare/v2.1.1...v2.2.0) (2026-10-08)


### Features

* oRPC foundation — typed /rpc router with better-auth + RBAC parity ([0de427d](https://github.com/namhtpyn/pathbridge/commit/0de427d5e1f36ae91c8f1616c380ecceee4d4ef1))

## [2.1.1](https://github.com/namhtpyn/pathbridge/compare/v2.1.0...v2.1.1) (2026-10-08)


### Bug Fixes

* **ci:** typecheck via bun, not npx ([f8d43b5](https://github.com/namhtpyn/pathbridge/commit/f8d43b5e3e431ca745646cff5d37b7b73c13bcd1))

# [2.1.0](https://github.com/namhtpyn/pathbridge/compare/v2.0.1...v2.1.0) (2026-10-08)


### Features

* new-version banner + bun-only toolchain ([2464b3a](https://github.com/namhtpyn/pathbridge/commit/2464b3ad7046a9055db2758c12aff896ec54e4f3))

## [2.0.1](https://github.com/namhtpyn/pathbridge/compare/v2.0.0...v2.0.1) (2026-10-08)


### Bug Fixes

* key scope matrix hides statements outside the RBAC vocabulary ([7e39fc1](https://github.com/namhtpyn/pathbridge/commit/7e39fc1a9f9fb4b9fd06935c783807b93ae89625))

# [2.0.0](https://github.com/namhtpyn/pathbridge/compare/v1.30.0...v2.0.0) (2026-10-07)


### Bug Fixes

* **release:** restore ! breaking-marker parsing in commit headers ([27face0](https://github.com/namhtpyn/pathbridge/commit/27face00f14cc1891d8f96a8744117362fc9c8da))


### Features

* rename pair -> route across the app ([59a67ed](https://github.com/namhtpyn/pathbridge/commit/59a67edd7838853c36c31b976c6327eea288fc5c))


### BREAKING CHANGES

* rename pair -> route across the app

# [1.30.0](https://github.com/namhtpyn/pathbridge/compare/v1.29.0...v1.30.0) (2026-10-07)


### Bug Fixes

* import ZodType in MCP route ([8aa0478](https://github.com/namhtpyn/pathbridge/commit/8aa0478bd5937fbb195fcb41ef38ca852f786e62))
* MCP route types for CI typecheck ([ee4766f](https://github.com/namhtpyn/pathbridge/commit/ee4766fc9d070e731c645ddb97881e5c9b75da99))
* type-level PairRow/drizzle issues in MCP tools ([72f2f3f](https://github.com/namhtpyn/pathbridge/commit/72f2f3f9e67c6249ff18616eab31be8dbd99c983))


### Features

* built-in MCP server at /mcp for AI agents ([1ad7f30](https://github.com/namhtpyn/pathbridge/commit/1ad7f30f365c47a42174c6bed0690e4977c15208))

# [1.29.0](https://github.com/namhtpyn/pathbridge/compare/v1.28.0...v1.29.0) (2026-10-07)


### Features

* key scope editor uses the grouped permission matrix ([07dbf74](https://github.com/namhtpyn/pathbridge/commit/07dbf74ee0837c64b018c13a76624c77989fcf27))

# [1.28.0](https://github.com/namhtpyn/pathbridge/compare/v1.27.1...v1.28.0) (2026-10-07)


### Bug Fixes

* widen Auth interface for api-key methods (CI typecheck) ([ba4c138](https://github.com/namhtpyn/pathbridge/commit/ba4c13814c500b150f5dd58b094e1510ea883058))


### Features

* API keys with per-key permission scoping ([06c500c](https://github.com/namhtpyn/pathbridge/commit/06c500cc34fc173cc5f650f078946e491918e34a))

## [1.27.1](https://github.com/namhtpyn/pathbridge/compare/v1.27.0...v1.27.1) (2026-10-07)


### Bug Fixes

* trust configured OIDC providers for account linking ([04777c9](https://github.com/namhtpyn/pathbridge/commit/04777c9e489ac62fb49ece17f10d965b5d1ab7c5))

# [1.27.0](https://github.com/namhtpyn/pathbridge/compare/v1.26.1...v1.27.0) (2026-10-07)


### Features

* email-verified toggle in user modals; rewrite README ([193e523](https://github.com/namhtpyn/pathbridge/commit/193e5231be880dc06e84b7d569e718c6b7332633))

## [1.26.1](https://github.com/namhtpyn/pathbridge/compare/v1.26.0...v1.26.1) (2026-10-07)


### Bug Fixes

* uuid-only provider ids, rename field to Name, drop redirect URIs alert ([d95116b](https://github.com/namhtpyn/pathbridge/commit/d95116b37d69a95f20b8cb5bc28ee82b59c7d916))

# [1.26.0](https://github.com/namhtpyn/pathbridge/compare/v1.25.0...v1.26.0) (2026-10-07)


### Features

* autogenerated uuid provider ids; show redirect URL in provider list ([3e0d831](https://github.com/namhtpyn/pathbridge/commit/3e0d831776419c4f9127d517668375d62b594189))

# [1.25.0](https://github.com/namhtpyn/pathbridge/compare/v1.24.1...v1.25.0) (2026-10-07)


### Features

* multiple OIDC providers ([262dff9](https://github.com/namhtpyn/pathbridge/commit/262dff9fe0047046e6d3c31ccf2b3b3ecca0dbf9))

## [1.24.1](https://github.com/namhtpyn/pathbridge/compare/v1.24.0...v1.24.1) (2026-10-07)


### Bug Fixes

* canonicalize email_verified for password users at boot ([6ccf3c6](https://github.com/namhtpyn/pathbridge/commit/6ccf3c64358d50f5d335f3c3c876ae3b3095e11c))

# [1.24.0](https://github.com/namhtpyn/pathbridge/compare/v1.23.0...v1.24.0) (2026-10-07)


### Features

* show app version on login screen and topbar ([12f9696](https://github.com/namhtpyn/pathbridge/commit/12f969665e645a7e5e0915a4432e91d10adb45a9))

# [1.23.0](https://github.com/namhtpyn/pathbridge/compare/v1.22.3...v1.23.0) (2026-10-07)


### Features

* seed default admin account on fresh container boot ([b62f76c](https://github.com/namhtpyn/pathbridge/commit/b62f76c33364d839357e91c96b6a062fc96f1d08))

## [1.22.3](https://github.com/namhtpyn/pathbridge/compare/v1.22.2...v1.22.3) (2026-10-07)


### Bug Fixes

* OIDC first login unable_to_create_user - scope first-user gate to password sign-up ([e3711ae](https://github.com/namhtpyn/pathbridge/commit/e3711aeace6ef798ccb03785745d71ced8015e62))

## [1.22.2](https://github.com/namhtpyn/pathbridge/compare/v1.22.1...v1.22.2) (2026-10-07)


### Bug Fixes

* resolve auth-config during SSR before login form render ([3b040d2](https://github.com/namhtpyn/pathbridge/commit/3b040d2dd844740d3a41cbf3496355351f2616bc))

## [1.22.1](https://github.com/namhtpyn/pathbridge/compare/v1.22.0...v1.22.1) (2026-10-07)


### Bug Fixes

* correct OIDC redirect URI hint to /auth/callback/oidc ([8f43c98](https://github.com/namhtpyn/pathbridge/commit/8f43c988071c97ed4b3ad73beec30604504ffd5c))

# [1.22.0](https://github.com/namhtpyn/pathbridge/compare/v1.21.1...v1.22.0) (2026-10-07)


### Features

* unify all record lists on UTable ([3840514](https://github.com/namhtpyn/pathbridge/commit/3840514599e841ba433087d821258997f2b00e9b))

## [1.21.1](https://github.com/namhtpyn/pathbridge/compare/v1.21.0...v1.21.1) (2026-10-07)


### Bug Fixes

* forward cookie during SSR data fetches ([0f89486](https://github.com/namhtpyn/pathbridge/commit/0f894861829a43b26bb1c3f7ce9252377fd737a0))

# [1.21.0](https://github.com/namhtpyn/pathbridge/compare/v1.20.1...v1.21.0) (2026-10-07)


### Bug Fixes

* drop unused sharp dep (lockfile sync) ([d43a559](https://github.com/namhtpyn/pathbridge/commit/d43a559a088e2a37323ea4ba2727a60c06447421))


### Features

* better-auth nuxt integration, branding, favicon, OIDC redirect hint ([8aebe89](https://github.com/namhtpyn/pathbridge/commit/8aebe895115897e66e04cf1d391328df57cc6c25))

## [1.20.1](https://github.com/namhtpyn/pathbridge/compare/v1.20.0...v1.20.1) (2026-10-07)


### Bug Fixes

* resolve session during SSR - no login-form flash on refresh ([da15b5e](https://github.com/namhtpyn/pathbridge/commit/da15b5e2872cc52e1521d35267a0cb2ad40f6c12))

# [1.20.0](https://github.com/namhtpyn/pathbridge/compare/v1.19.0...v1.20.0) (2026-10-07)


### Features

* user editing + role assignment on create ([778a115](https://github.com/namhtpyn/pathbridge/commit/778a115e524086b0e2b870f52125b05621481422))

# [1.19.0](https://github.com/namhtpyn/pathbridge/compare/v1.18.0...v1.19.0) (2026-10-07)


### Features

* tighten builtin roles ([79a0e4e](https://github.com/namhtpyn/pathbridge/commit/79a0e4e9efeae557da4de343e9265e84724a4acb))

# [1.18.0](https://github.com/namhtpyn/pathbridge/compare/v1.17.0...v1.18.0) (2026-10-07)


### Features

* viewer is builtin again (admin + viewer) ([a8f1d1f](https://github.com/namhtpyn/pathbridge/commit/a8f1d1f0c90e49303bc37c6234cf5c0e70d41e51))

# [1.17.0](https://github.com/namhtpyn/pathbridge/compare/v1.16.0...v1.17.0) (2026-10-07)


### Features

* master radio group on resource rows ([de5c88f](https://github.com/namhtpyn/pathbridge/commit/de5c88f9b863f94b7f1ddae53e04ada743cdec0b))

# [1.16.0](https://github.com/namhtpyn/pathbridge/compare/v1.15.0...v1.16.0) (2026-10-07)


### Features

* grouped permissions matrix via UTable ([96eda28](https://github.com/namhtpyn/pathbridge/commit/96eda28069cd06a5e408c13446e69c0b6a8490f3))

# [1.15.0](https://github.com/namhtpyn/pathbridge/compare/v1.14.0...v1.15.0) (2026-10-07)


### Features

* permissions matrix table with None/Own/All radio selection ([483cf98](https://github.com/namhtpyn/pathbridge/commit/483cf98a1a17173b9512bb3f4805ec32b354d886))

# [1.14.0](https://github.com/namhtpyn/pathbridge/compare/v1.13.0...v1.14.0) (2026-10-07)


### Features

* single builtin role, hover popovers, role modal help ([8fb3ce0](https://github.com/namhtpyn/pathbridge/commit/8fb3ce00ae5d8c01fe350a14a08bbf8eb42a9e78))

# [1.13.0](https://github.com/namhtpyn/pathbridge/compare/v1.12.3...v1.13.0) (2026-10-07)


### Features

* role editing, target path support, popovers for field help ([e6da368](https://github.com/namhtpyn/pathbridge/commit/e6da368e2b312610471e59678d0e7810beadd65e))

## [1.12.3](https://github.com/namhtpyn/pathbridge/compare/v1.12.2...v1.12.3) (2026-10-07)


### Bug Fixes

* modal consistency, profile close bug, mobile button alignment ([59f7119](https://github.com/namhtpyn/pathbridge/commit/59f7119fd0b006a0df64ef84ab648dc8e75f7e49))

## [1.12.2](https://github.com/namhtpyn/pathbridge/compare/v1.12.1...v1.12.2) (2026-10-07)


### Bug Fixes

* profile modal pre-populates fields and gives feedback on no-op save ([3c5e704](https://github.com/namhtpyn/pathbridge/commit/3c5e704ef96fb1cb2eba8622963a76e9af7a93fa))

## [1.12.1](https://github.com/namhtpyn/pathbridge/compare/v1.12.0...v1.12.1) (2026-10-07)


### Bug Fixes

* align role form with the app's form pattern ([7b20f02](https://github.com/namhtpyn/pathbridge/commit/7b20f02a8939e51861817b3ea1797fcdd911fc44))

# [1.12.0](https://github.com/namhtpyn/pathbridge/compare/v1.11.0...v1.12.0) (2026-10-07)


### Features

* profile modal — self-service name, email, and password change ([9b03a16](https://github.com/namhtpyn/pathbridge/commit/9b03a16eca450b56bad92916ca1f28eac8faf65e))

# [1.11.0](https://github.com/namhtpyn/pathbridge/compare/v1.10.0...v1.11.0) (2026-10-07)


### Features

* role-based access control — runtime roles, own/all scopes, permission-gated UI ([1e3cb27](https://github.com/namhtpyn/pathbridge/commit/1e3cb27399bd3043f19c14270f58db74ec1c0eb7))

# [1.10.0](https://github.com/namhtpyn/pathbridge/compare/v1.9.2...v1.10.0) (2026-10-06)


### Bug Fixes

* sync package-lock.json with @better-auth/api-key ([8010f2c](https://github.com/namhtpyn/pathbridge/commit/8010f2cf39701154868550eae34afeff77ac5f4e))


### Features

* API keys via @better-auth/api-key — Bearer keys for agent/programmatic access ([4edcd7b](https://github.com/namhtpyn/pathbridge/commit/4edcd7ba606eeb59851c6e0c316b8d4e87e3e74c))

## [1.9.2](https://github.com/namhtpyn/pathbridge/compare/v1.9.1...v1.9.2) (2026-10-06)


### Bug Fixes

* methods column -> drizzle json-mode text; fixes pair list render crash ([10ed95c](https://github.com/namhtpyn/pathbridge/commit/10ed95c9d5b05f2468ce020e1c79ddaaf2e37461))

## [1.9.1](https://github.com/namhtpyn/pathbridge/compare/v1.9.0...v1.9.1) (2026-10-06)


### Bug Fixes

* bun:sqlite sync transaction — non-async callback with .run() ([c42444d](https://github.com/namhtpyn/pathbridge/commit/c42444d2fa43196022a22c476af6afc2af9f3d95))
* senior review pass — update-in-place, dead code, mobile-first UI ([7a48e8e](https://github.com/namhtpyn/pathbridge/commit/7a48e8ec5fe1c7ab95df0b20aa40501c3304ceae))

# [1.9.0](https://github.com/namhtpyn/pathbridge/compare/v1.8.0...v1.9.0) (2026-10-06)


### Features

* drop underscore prefixes — /auth, /health, /api, /admin ([059679b](https://github.com/namhtpyn/pathbridge/commit/059679bed2f2bcb92c88877d434eb72ec505863d))

# [1.8.0](https://github.com/namhtpyn/pathbridge/compare/v1.7.0...v1.8.0) (2026-10-06)


### Features

* admin at /admin, root redirect, reserved-path guards ([3bf6fe2](https://github.com/namhtpyn/pathbridge/commit/3bf6fe21b7963f073068e8532fdfa5c9c7d6255a))

# [1.7.0](https://github.com/namhtpyn/pathbridge/compare/v1.6.0...v1.7.0) (2026-10-06)


### Features

* per-pair HTTP method allowlist ([07f4701](https://github.com/namhtpyn/pathbridge/commit/07f470174a345465d0dbbb1ac364ce4c5d491c99))

# [1.6.0](https://github.com/namhtpyn/pathbridge/compare/v1.5.0...v1.6.0) (2026-10-06)


### Features

* info-icon tooltips on all form fields; id-based pair delete ([b8f663a](https://github.com/namhtpyn/pathbridge/commit/b8f663afc9ea07144dbd1915f93730eb884a2adc))

# [1.5.0](https://github.com/namhtpyn/pathbridge/compare/v1.4.0...v1.5.0) (2026-10-06)


### Features

* complete admin UI redesign — app shell, modals, polish ([5cff80e](https://github.com/namhtpyn/pathbridge/commit/5cff80e7d1183fc56e8a8ec0b8adb158e69c5927))

# [1.4.0](https://github.com/namhtpyn/pathbridge/compare/v1.3.0...v1.4.0) (2026-10-06)


### Features

* settings page, user management, access log with retention ([74183b6](https://github.com/namhtpyn/pathbridge/commit/74183b6770f513c71fa1b9bd3c5b37927387f5b3))

# [1.3.0](https://github.com/namhtpyn/pathbridge/compare/v1.2.0...v1.3.0) (2026-10-06)


### Features

* exact vs wildcard path matching, stripPrefix wildcard-only ([5220ab4](https://github.com/namhtpyn/pathbridge/commit/5220ab471d10c868274caa94b8a454317eeabdb2))

# [1.2.0](https://github.com/namhtpyn/pathbridge/compare/v1.1.3...v1.2.0) (2026-10-06)


### Bug Fixes

* typecheck under noUncheckedIndexedAccess; UCard v4 ui keys ([00f5b0f](https://github.com/namhtpyn/pathbridge/commit/00f5b0f038507c7aa645fcd293415e2b30d1d880))


### Features

* frontend zod schema transforms loose input before submit ([bb1d23a](https://github.com/namhtpyn/pathbridge/commit/bb1d23af02b8940e9367b0b68daf3318955460ec))
* Nuxt UI v4 admin + strict zod backend validation ([56de296](https://github.com/namhtpyn/pathbridge/commit/56de29624ea63be4f9cae5e6e6854dee07077266))

## [1.1.3](https://github.com/namhtpyn/pathbridge/compare/v1.1.2...v1.1.3) (2026-10-06)


### Bug Fixes

* first-user gate — drizzle rc findFirst returns undefined, not null ([abd9b4f](https://github.com/namhtpyn/pathbridge/commit/abd9b4fa4ac8a4732af2a236411629803b156478))

## [1.1.2](https://github.com/namhtpyn/pathbridge/compare/v1.1.1...v1.1.2) (2026-10-06)


### Bug Fixes

* pin docker runtime to oven/bun:latest ([6642686](https://github.com/namhtpyn/pathbridge/commit/664268640d468fc7f0c146c4ecd48e3d304e5b05))

## [1.1.1](https://github.com/namhtpyn/pathbridge/compare/v1.1.0...v1.1.1) (2026-10-06)


### Bug Fixes

* bun runtime in docker image (server imports bun:sqlite) ([940ab29](https://github.com/namhtpyn/pathbridge/commit/940ab29baf99f2567f6f8080c5b1ad12323ed783))

# [1.1.0](https://github.com/namhtpyn/pathbridge/compare/v1.0.1...v1.1.0) (2026-10-06)


### Features

* close sign-up after first user; optional BETTER_AUTH_URL ([ac63a93](https://github.com/namhtpyn/pathbridge/commit/ac63a93d7920ae6cd88298e41d8e1c806d03fc9b))

## [1.0.1](https://github.com/namhtpyn/pathbridge/compare/v1.0.0...v1.0.1) (2026-10-06)


### Bug Fixes

* wire release outputs via semantic-release-action; docker on dispatch ([23ecef5](https://github.com/namhtpyn/pathbridge/commit/23ecef5faa316d0a13b8cde52061e32a354f6e2a))

# 1.0.0 (2026-10-06)


### Bug Fixes

* clean lockfile regeneration (esbuild dedupe) ([7843b3b](https://github.com/namhtpyn/pathbridge/commit/7843b3bd6e7ca715b5a8ff76b1ae84a5f36f5dcb))
* pin esbuild via overrides (single 0.25.12) for CI npm ci ([da6fe6d](https://github.com/namhtpyn/pathbridge/commit/da6fe6da4709df1d33471a1fdc56670988226849))
* regenerate lockfile with npm for CI ([d5acb9d](https://github.com/namhtpyn/pathbridge/commit/d5acb9d09960dd5f0610eac8dd59df28c725cfab))


### Features

* optional OIDC provider with password-login disable option ([e6e4eca](https://github.com/namhtpyn/pathbridge/commit/e6e4eca017a7fafc488c319e183af4e6248db465))
* path-to-URL forwarding proxy with admin UI ([6956fc0](https://github.com/namhtpyn/pathbridge/commit/6956fc082db6bc8feff8c3726f272bad3c0d1a32))
