// DELETE /api/pairs/:ref — remove a pair by numeric id (preferred) or by
// path-without-leading-slash (legacy). Auth required. Read-back via RQB.
import { eq, or } from 'drizzle-orm'
import { db } from '../../db'
import { pairs } from '../../db/schema'
import type { PairRow } from '../../../shared/types'
import { requireRecordPermission } from '../../utils/permissions'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  const ref = getRouterParam(event, 'path')
  if (!ref) throw createError({ statusCode: 400, statusMessage: 'missing reference' })

  const decoded = decodeURIComponent(ref)
  const id = Number(decoded)
  const target = Number.isInteger(id) && id > 0
    ? await db.query.pairs.findFirst({ where: { id } })
    : await db.query.pairs.findFirst({ where: { OR: [{ path: `/${decoded}` }, { path: decoded }] } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'pair not found' })

  await requireRecordPermission(event, 'pairs', 'delete', target)
  await db.delete(pairs).where(eq(pairs.id, target.id))
  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
