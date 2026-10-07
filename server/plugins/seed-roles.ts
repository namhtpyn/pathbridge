// Seed builtin roles at boot (idempotent).
import { db } from '../db'
import { roles as rolesTable } from '../db/schema'
import { STATEMENTS } from '../utils/permissions'

const BUILTIN = [
  {
    name: 'admin',
    description: 'Full access to everything',
    statements: Object.fromEntries(
      Object.entries(STATEMENTS).map(([r, actions]) => [r, [...actions]]),
    ),
  },
  {
    name: 'operator',
    description: 'Manage own pairs, read logs',
    statements: {
      pairs: ['create:all', 'read:own', 'update:own', 'delete:own'],
      logs: ['read:own'],
    },
  },
  {
    name: 'viewer',
    description: 'Read-only on own records',
    statements: {
      pairs: ['read:own'],
      logs: ['read:own'],
    },
  },
]

export default defineEventHandler(async () => {
  const existing = await db.query.roles.findMany()
  const now = new Date().toISOString()
  for (const r of BUILTIN) {
    if (existing.some(e => e.name === r.name)) continue
    await db.insert(rolesTable).values({
      id: crypto.randomUUID(),
      name: r.name,
      description: r.description,
      statements: r.statements,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    })
  }
  return true
})
