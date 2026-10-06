// better-auth (Relations v2): email+password, canonical tables via drizzle rc.
// Seed first user: bun scripts/create-admin.ts <email> <password>
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { db } from '../db'
import { authSchema } from '../db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: authSchema,
  }),
  basePath: '/_auth',
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
})

export type Session = typeof auth.$Infer.Session
