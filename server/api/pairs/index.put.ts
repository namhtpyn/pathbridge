// PUT /api/pairs — upsert one pair (auth required). Body validated at runtime;
// insert/upsert on the core API (RQB has no upsert); read-back via RQB.
import { db } from '../../db'
import { pairs } from '../../db/schema'
import { isPairInput, type PairRow } from '../../../shared/types'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  await requireSession(event)
  const body: unknown = await readBody(event)

  if (!isPairInput(body)) {
    throw createError({ statusCode: 400, statusMessage: 'body must include string path and target' })
  }

  const { path, target } = body
  if (!path.startsWith('/') || path.startsWith('/_')) {
    throw createError({ statusCode: 400, statusMessage: 'path must start with "/" and must not use reserved prefix "_"' })
  }
  let u: URL
  try {
    u = new URL(target)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'target must be an absolute URL' })
  }
  if (u.pathname !== '/' && u.pathname !== '') {
    throw createError({ statusCode: 400, statusMessage: 'target must be an origin only (no path)' })
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'target must be http(s)' })
  }

  const row = {
    path,
    target: u.origin,
    upstreamHost: typeof body.upstreamHost === 'string' && body.upstreamHost ? body.upstreamHost : null,
    stripPrefix: body.stripPrefix === true,
    note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
    enabled: body.enabled !== false,
    updatedAt: new Date().toISOString(),
  }

  await db.insert(pairs).values(row)
    .onConflictDoUpdate({ target: pairs.path, set: row })

  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
