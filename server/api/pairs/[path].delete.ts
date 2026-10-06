// DELETE /api/pairs/:ref — remove a pair by numeric id (preferred) or by
// path-without-leading-slash (legacy). Auth required. Read-back via RQB.
import { eq, or } from 'drizzle-orm'
import { db } from '../../db'
import { pairs } from '../../db/schema'
import type { PairRow } from '../../../shared/types'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  await requireSession(event)
  const ref = getRouterParam(event, 'path')
  if (!ref) throw createError({ statusCode: 400, statusMessage: 'missing reference' })

  const decoded = decodeURIComponent(ref)
  const id = Number(decoded)
  const cond = Number.isInteger(id) && id > 0
    ? eq(pairs.id, id)
    : or(eq(pairs.path, `/${decoded}`), eq(pairs.path, decoded))

  await db.delete(pairs).where(cond)
  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
