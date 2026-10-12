// keys service: current-user API keys (ownership = referenceId)
import { eq, desc } from 'drizzle-orm'
import { notFound } from '../shared/context'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db
import { apiKey as apiKeyTable } from '../../db/schema'

/** parse stored key permissions (plain or double-JSON-encoded) */
export function parseKeyPermissions(raw: string | null | undefined): Record<string, string[]> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed
  }
  catch {
    return null
  }
}

export async function listKeys(userId: string) {
  const rows = await (await getDb()).select().from(apiKeyTable).where(eq(apiKeyTable.referenceId, userId)).orderBy(desc(apiKeyTable.createdAt))
  return { keys: rows.map(k => ({
    id: k.id,
    name: k.name,
    start: k.start,
    enabled: k.enabled,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    lastRequest: k.lastRequest ? k.lastRequest.toISOString() : null,
    requestCount: k.requestCount,
    // json-mode column: drizzle types it unknown after select
    permissions: parseKeyPermissions(typeof k.permissions === 'string' ? k.permissions : JSON.stringify(k.permissions) ?? null),
  })) }
}

/** ownership check shared by rename/revoke (no touching other people's keys) */
export async function requireOwnedKey(id: string, userId: string) {
  const owned = (await (await getDb()).select().from(apiKeyTable).where(eq(apiKeyTable.id, id)))[0]
  if (!owned || owned.referenceId !== userId) notFound('key not found')
  return owned
}

export async function deleteKey(id: string) {
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../../db')
  await db.delete(apiKeyTable).where(eq(apiKeyTable.id, id))
}
