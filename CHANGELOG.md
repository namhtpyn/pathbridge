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
