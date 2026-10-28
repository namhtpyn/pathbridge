// keys service: current-user API keys (ownership = referenceId)
import { notFound } from '../shared/context'
// lazy db access: nuxt prepare (jiti/Node) must never statically reach
// bun:sqlite through this module — services load the client on first call
const getDb = async () => (await import('../../db')).db
import { apiKey as apiKeyTable } from '../../db/schema'

/** parse stored key permissions. `apikey.permissions` is a TEXT column (not
 *  json-mode) and rows written by older better-auth versions can be
 *  double-encoded — handle both */
export function parseKeyPermissions(raw: unknown): Record<string, string[]> | null {
  if (!raw) return null
  // verifyApiKey hands back the parsed object; older/raw rows are strings
  // (possibly double-encoded) — both shapes must narrow, never silently drop
  if (typeof raw === 'object') return raw as Record<string, string[]>
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') return JSON.parse(parsed) as Record<string, string[]>
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string[]> : null
  }
  catch {
    return null
  }
}

export async function listKeys(userId: string) {
  const rows = await (await getDb()).query.apikey.findMany({
    where: { referenceId: userId },
    columns: { id: true, name: true, start: true, enabled: true, expiresAt: true, lastRequest: true, requestCount: true, permissions: true },
    orderBy: { createdAt: 'desc', id: 'asc' },
  })
  return { keys: rows.map(k => ({
    id: k.id,
    name: k.name,
    start: k.start,
    enabled: k.enabled,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    lastRequest: k.lastRequest ? k.lastRequest.toISOString() : null,
    requestCount: k.requestCount,
    // text column: drizzle types it unknown after select — the parser narrows
    // both raw JSON text and an already-parsed object
    permissions: parseKeyPermissions(k.permissions),
  })) }
}

/** ownership check shared by rename/revoke (no touching other people's keys) */
export async function requireOwnedKey(id: string, userId: string) {
  const owned = await (await getDb()).query.apikey.findFirst({
    where: { id },
    columns: { id: true, referenceId: true },
    orderBy: { id: 'asc' },
  })
  if (!owned || owned.referenceId !== userId) notFound('key not found')
  return owned
}

/** delete an own key — ownership is part of the DELETE predicate, so a missing
 *  row and someone else's row both answer notFound without a separate read */
export async function deleteKey(id: string, userId: string) {
  const { and, eq } = await import('drizzle-orm')
  const res = await (await getDb()).delete(apiKeyTable)
    .where(and(eq(apiKeyTable.id, id), eq(apiKeyTable.referenceId, userId)))
  if (res.changes !== 1) notFound('key not found')
}
