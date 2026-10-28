import { v7 as uuidv7 } from 'uuid'
// Seed builtin roles at boot (idempotent).
import { db } from '../db'
import { eq } from 'drizzle-orm'
import { roles as rolesTable } from '../db/schema'
import { STATEMENTS } from '../lib/permissions'

const BUILTIN: Array<{ name: string, description: string, statements: Record<string, string[]> }> = [
  {
    name: 'admin',
    description: 'Full access to everything',
    // :all only - "action:all" implies "action:own", so own-scoped
    // statements are redundant for the admin role
    statements: {
      ...Object.fromEntries(
        Object.entries(STATEMENTS).map(([r, actions]) => [r, actions.filter(a => a.endsWith(':all'))]),
      ),
      // profile is own-only by design; admins still manage their own profile
      profile: ['read:own', 'update:own'],
    },
  },
  {
    name: 'viewer',
    description: 'Read own routes + manage own profile (default for new users)',
    statements: {
      routes: ['read:own'],
      profile: ['read:own', 'update:own'],
    },
  },
]

// Roles demoted from builtin in earlier versions: boot converts them to
// regular editable/deletable roles so existing assignments keep working.
const DEMOTED = ['operator']

export async function seedRoles() {
  const existing = await db.query.roles.findMany()
  const now = new Date().toISOString()
  for (const r of BUILTIN) {
    const row = existing.find(e => e.name === r.name)
    if (!row) {
      await db.insert(rolesTable).values({
        id: uuidv7(),
        name: r.name,
        description: r.description,
        statements: r.statements,
        builtin: true,
        createdAt: now,
        updatedAt: now,
      })
      continue
    }
    // canonicalize: builtin roles are tamper-proof; boot resets any drift
    await db.update(rolesTable)
      .set({ description: r.description, statements: r.statements, builtin: true, updatedAt: now })
      .where(eq(rolesTable.name, r.name))
  }
  for (const name of DEMOTED) {
    await db.update(rolesTable)
      .set({ builtin: false })
      .where(eq(rolesTable.name, name))
  }
  // upgrade path: earlier versions seeded viewer as non-builtin
  await db.update(rolesTable)
    .set({ builtin: true })
    .where(eq(rolesTable.name, 'viewer'))
  return true
}

// Nitro registers every file under server/plugins; seed-admin awaits this
// directly, so the plugin hook itself stays a no-op.
export default defineNitroPlugin(() => {})
