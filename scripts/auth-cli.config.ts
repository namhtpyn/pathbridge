import { Database } from 'bun:sqlite'
// better-auth CLI config bridge (npx/bunx auth generate --config scripts/auth-cli.config.ts).
// The real auth instance is a settings-driven lazy singleton (server/utils/auth.ts);
// the CLI can't load that (needs DB + settings). This bridge feeds generate the SAME
// plugins + field options against a throwaway in-memory shape, so the generated schema
// matches what the runtime uses. Plugin-driven tables (bearer adds none, apiKey adds
// apikey, genericOAuth adds none) are the schema-relevant surface.
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins/bearer'
import { apiKey } from '@better-auth/api-key'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'

export const auth = betterAuth({
  // schema-generation only: throwaway bun:sqlite handle (CLI never writes to it
  // for `generate --adapter drizzle`, but the adapter must initialize)
  database: { provider: 'sqlite', db: new Database('/tmp/pb-auth-cli-scratch.db') },
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
    },
  },
})

export default auth
