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
