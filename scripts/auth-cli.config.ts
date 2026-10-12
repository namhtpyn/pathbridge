// better-auth CLI config bridge (bun run auth:schema).
// The real auth instance is a settings-driven lazy singleton (server/lib/auth.ts)
// that the CLI can't load (needs DB + settings). This bridge feeds `generate` the
// SAME plugins + adapter as the runtime — crucially the relations-v2 adapter, so
// the CLI emits v2 output (defineRelationsPart + authRelations) instead of the
// default v1 `relations()` shape (per the drizzle#drizzle-relations-v2 docs).
// Plugin-driven tables are the schema surface: bearer (none), apiKey (apikey),
// genericOAuth (none).
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins/bearer'
import { apiKey } from '@better-auth/api-key'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'

// throwaway in-memory db: the CLI never writes for `generate`, but the
// relations-v2 adapter must construct a real drizzle client
const sqlite = new Database(':memory:')
const db = drizzle({ client: sqlite })

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {}, // empty: the CLI generates it; runtime passes the full authSchema
  }),
  basePath: '/auth',
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'viewer', input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  plugins: [
    bearer(),
    apiKey({ rateLimit: { enabled: false } }),
    genericOAuth({ config: [{ providerId: 'oidc', discoveryUrl: 'https://example.com/.well-known/openid-configuration', clientId: 'x', clientSecret: 'x' }] }),
  ],
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
      joins: true,
    },
  },
})

export default auth
