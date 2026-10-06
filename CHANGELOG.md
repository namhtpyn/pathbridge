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
