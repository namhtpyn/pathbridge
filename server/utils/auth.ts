// better-auth (Relations v2): email+password by default; optional generic OIDC
// provider via env OR runtime Settings (DB). Policy resolves Settings-first,
// env-fallback. The auth instance is a lazily-built singleton that REBUILDS
// when the policy changes (OIDC discovery runs at plugin init, so live-edit
// requires a rebuild — sessions live in the DB and survive rebuilds).
//
// Env (seed/fallback):
//   BETTER_AUTH_SECRET           — session signing (required in prod)
//   OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
//   OIDC_DISABLED_PASSWORD_LOGIN — "true" to turn off email+password
//
// Runtime: /_admin -> Settings tab -> stored in the `settings` table.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { db } from '../db'
import { authSchema } from '../db/schema'
import { getSettings } from './settings'

const env = process.env

export interface AuthPolicy {
  oidcEnabled: boolean
  passwordEnabled: boolean
  issuer: string | undefined
  clientId: string | undefined
  clientSecret: string | undefined
}

/** Settings-first, env-fallback policy resolution. */
export async function resolveAuthPolicy(): Promise<AuthPolicy> {
  const s = await getSettings()
  const issuer = s.oidcIssuer || env.OIDC_ISSUER
  const clientId = s.oidcClientId || env.OIDC_CLIENT_ID
  const clientSecret = s.oidcClientSecret || env.OIDC_CLIENT_SECRET
  const oidcEnabled = Boolean(issuer && clientId && clientSecret)
  const passwordEnabled = !(oidcEnabled && (s.disablePasswordLogin || env.OIDC_DISABLED_PASSWORD_LOGIN === 'true'))
  return { oidcEnabled, passwordEnabled, issuer, clientId, clientSecret }
}

async function anyUserExists(): Promise<boolean> {
  return await db.query.user.findFirst({ columns: { id: true } }).then(r => r != null)
}

// better-auth's Auth type varies with the exact plugin/config shape; the
// rebuildable factory swaps plugins at runtime, so type the instance by the
// surface consumers use (handler + api.getSession).
interface Auth {
  handler: (request: Request) => Promise<Response>
  api: {
    getSession: (opts: { headers: Headers }) => Promise<{
      user: { id: string, name: string, email: string, emailVerified: boolean, image?: string | null }
      session: { id: string, userId: string, expiresAt: Date }
    } | null>
  }
}
let instance: Auth | null = null
let builtWith = ''

function policyKey(p: AuthPolicy): string {
  return JSON.stringify([p.issuer, p.clientId, p.passwordEnabled])
}

async function buildAuth(): Promise<Auth> {
  const p = await resolveAuthPolicy()
  builtWith = policyKey(p)
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    basePath: '/_auth',
    ...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
    databaseHooks: {
      user: {
        create: {
          // public deployments: first user claims the instance, sign-up closes after
          before: async () => (await anyUserExists() ? false : undefined),
        },
      },
    },
    emailAndPassword: {
      enabled: p.passwordEnabled,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    ...(p.oidcEnabled
      ? {
          plugins: [
            genericOAuth({
              config: [{
                providerId: 'oidc',
                discoveryUrl: `${p.issuer!.replace(/\/+$/, '')}/.well-known/openid-configuration`,
                clientId: p.clientId!,
                clientSecret: p.clientSecret!,
              }],
            }),
          ],
        }
      : {}),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  })
}

/** Lazily-built auth instance; auto-rebuilds when the policy changed. */
export async function getAuth(): Promise<Auth> {
  const p = await resolveAuthPolicy()
  const key = policyKey(p)
  if (!instance || key !== builtWith) {
    instance = await buildAuth()
  }
  return instance
}

/** Force an immediate rebuild after Settings writes. */
export async function rebuildAuth(): Promise<void> {
  instance = await buildAuth()
}

export type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>
