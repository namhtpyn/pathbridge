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
// Runtime: /admin -> Settings tab -> stored in the `settings` table.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { bearer } from 'better-auth/plugins/bearer'
import { apiKey } from '@better-auth/api-key'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user as userTable } from '../db/schema'
import { authSchema } from '../db/schema'
import { getSettings } from './settings'
import { getOidcProviders, type OidcProvider } from './oidc'

const env = process.env

export interface AuthPolicy {
  oidcEnabled: boolean
  passwordEnabled: boolean
  oidcProviders: OidcProvider[]
}

/** Settings-first, env-fallback policy resolution. */
export async function resolveAuthPolicy(): Promise<AuthPolicy> {
  const s = await getSettings()
  const providers = await getOidcProviders()
  const oidcEnabled = providers.length > 0
  const passwordEnabled = !(oidcEnabled && (s.disablePasswordLogin || env.OIDC_DISABLED_PASSWORD_LOGIN === 'true'))
  return { passwordEnabled, oidcEnabled, oidcProviders: providers }
}
export async function anyUserExists(): Promise<boolean> {
  return await db.query.user.findFirst({ columns: { id: true } }).then(r => r != null)
}

// better-auth's Auth type varies with the exact plugin/config shape; the
// rebuildable factory swaps plugins at runtime, so type the instance by the
// surface consumers use (handler + api.getSession).
interface Auth {
  handler: (request: Request) => Promise<Response>
  api: {
    getSession: (opts: { headers: Headers }) => Promise<{
      user: { id: string, name: string, email: string, emailVerified: boolean, image?: string | null, role?: string | null }
      session: { id: string, userId: string, expiresAt: Date }
    } | null>
    verifyApiKey: (opts: { body: { key: string } }) => Promise<{
      valid: boolean
      error?: { message?: string } | null
      key?: {
        id?: string
        referenceId?: string
        expiresAt?: Date | string | null
        name?: string | null
        enabled?: boolean
        lastRequest?: Date | string | null
        rateLimitEnabled?: boolean | null
        remaining?: number | null
      } | null
    }>
  }
}
let instance: Auth | null = null
let builtWith = ''

function policyKey(p: AuthPolicy): string {
  // everything that feeds betterAuth() config — a stale instance would keep
  // serving the old OIDC secret. In-memory only; never logged.
  return JSON.stringify([p.oidcProviders.map(x => [x.id, x.issuer, x.clientId, x.clientSecret]), p.passwordEnabled])
}

async function buildAuth(): Promise<Auth> {
  const p = await resolveAuthPolicy()
  builtWith = policyKey(p)
  // single justified cast: the plugin-heavy Auth<...> return is structurally
  // compatible with the widened interface consumers rely on
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    basePath: '/auth',
    ...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
    databaseHooks: {
      user: {
        create: {
          // first-user gate lives in routes/auth/[...].ts (blocks /auth/sign-up/email
          // once any user exists) - a DB hook here would also kill OIDC first logins,
          // which must be allowed whenever OIDC is configured.
          before: undefined,
          after: async (user) => {
            // first user claims the instance -> admin role
            if (user && typeof user === 'object' && 'id' in user) {
              const count = await db.query.user.findMany({ columns: { id: true } })
              if (count.length === 1) {
                await db.update(userTable).set({ role: 'admin' }).where(eq(userTable.id, (user as { id: string }).id))
              }
            }
          },
        },
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'viewer', input: false },
      },
    },
    emailAndPassword: {
      enabled: p.passwordEnabled,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [
      // Authorization: Bearer <session-token> -> session (agent/MCP-friendly)
      bearer(),
      // long-lived revocable API keys (@better-auth/api-key).
      // default rate limit (10/day -> silent 401) is a footgun for script/agent
      // use; disabled per key, keys are revocable instead
      apiKey({ rateLimit: { enabled: false } }),
      ...(p.oidcProviders.length > 0
        ? [
            genericOAuth({
              config: p.oidcProviders.map(prov => ({
                providerId: prov.id,
                discoveryUrl: `${prov.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
                clientId: prov.clientId,
                clientSecret: prov.clientSecret,
              })),
            }),
          ]
        : []),
    ],
    account: {
      accountLinking: {
        // generic-oauth providers are configured by the instance admin, so
        // they are trusted to link by email (custom providers are not in
        // better-auth's builtin trusted list; without this, auto-linking
        // requires an email_verified claim the IdP may not send)
        trustedProviders: p.oidcProviders.map(x => x.id),
      },
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  }) as unknown as Auth
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
