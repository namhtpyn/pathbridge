// DELETE /api/pairs/:path — remove a pair by path (auth required).
// Delete stays on the core API; read-back via RQB.
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { pairs } from '../../db/schema'
import type { PairRow } from '../../../shared/types'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  await requireSession(event)
  const path = getRouterParam(event, 'path')
  if (!path) throw createError({ statusCode: 400, statusMessage: 'missing path' })
  await db.delete(pairs).where(eq(pairs.path, '/' + decodeURIComponent(path)))
  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
