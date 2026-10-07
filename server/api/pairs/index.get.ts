// GET /api/pairs — list pairs (auth + read scope). RQB.
// read-all: every pair; read-own: only pairs owned by the caller.
import { db } from '../../db'
import type { PairRow } from '../../../shared/types'
import { requireReadScope } from '../../utils/permissions'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  const { user, scope } = await requireReadScope(event, 'pairs')
  const rows = scope === 'all'
    ? await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
    : await db.query.pairs.findMany({ where: { userId: user.userId }, orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
