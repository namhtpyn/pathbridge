// better-auth (Relations v2): email+password by default; optional generic OIDC
// provider via env; password login can be disabled when OIDC is configured.
//
// Env:
//   BETTER_AUTH_SECRET           — session signing (required in prod)
//   OIDC_ISSUER                  — set to enable OIDC (e.g. https://login.microsoftonline.com/<tenant>/v2.0)
//   OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
//   OIDC_DISABLED_PASSWORD_LOGIN — "true" to turn off email+password entirely
//
// Seed first user: bun scripts/create-admin.ts <email> <password>
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { db } from '../db'
import { authSchema } from '../db/schema'

const env = process.env
const oidcIssuer = env.OIDC_ISSUER
const oidcClientId = env.OIDC_CLIENT_ID
const oidcClientSecret = env.OIDC_CLIENT_SECRET
const oidcEnabled = Boolean(oidcIssuer && oidcClientId && oidcClientSecret)
const passwordEnabled = !(oidcEnabled && env.OIDC_DISABLED_PASSWORD_LOGIN === 'true')

export const passwordLoginEnabled = passwordEnabled
export const oidcConfigured = oidcEnabled

async function anyUserExists(): Promise<boolean> {
  return await db.query.user.findFirst({ columns: { id: true } }).then(r => r !== null)
}

export const auth = betterAuth({
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
    enabled: passwordEnabled,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  ...(oidcEnabled
    ? {
        plugins: [
          genericOAuth({
            config: [{
              providerId: 'oidc',
              discoveryUrl: `${oidcIssuer!.replace(/\/+$/, '')}/.well-known/openid-configuration`,
              clientId: oidcClientId!,
              clientSecret: oidcClientSecret!,
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

export type Session = typeof auth.$Infer.Session
