// GET /api/pairs — list all pairs (auth required). RQB.
import { db } from '../../db'
import type { PairRow } from '../../../shared/types'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  await requireSession(event)
  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
