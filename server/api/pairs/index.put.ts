// PUT /api/pairs — upsert one pair (auth required). Zod-validated input
// (backend security boundary); insert/upsert on the core API (RQB has no
// upsert); read-back via RQB.
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { pairs } from '../../db/schema'
import type { PairRow } from '../../../shared/types'
import { pairInputSchema } from '../../utils/pair-schema'
import { requireUser, userCan, requireRecordPermission } from '../../utils/permissions'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  const { user } = await requireUser(event)
  const body: unknown = await readBody(event)

  const parsed = pairInputSchema.safeParse(body)
  if (!parsed.success) {
    const issue: { path: (string | number | symbol)[], message: string } | undefined = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid pair payload',
    })
  }

  const { path, target } = parsed.data
  const u = new URL(target) // re-parsed; schema guaranteed http(s), no query/hash

  // keep origin+path (path prefix is forwarded); strip any trailing slash on the path
  const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')

  const row = {
    path,
    target: targetUrl,
    upstreamHost: parsed.data.upstreamHost ?? null,
    stripPrefix: parsed.data.stripPrefix,
    methods: parsed.data.methods ?? null,
    note: parsed.data.note !== undefined ? parsed.data.note.slice(0, 200) : null,
    enabled: parsed.data.enabled,
    updatedAt: new Date().toISOString(),
  }

  if (parsed.data.id !== undefined) {
    // update by id — path rename allowed unless another pair already claims it
    const pairId: number = parsed.data.id
    const existing = await db.query.pairs.findFirst({ where: { id: pairId } })
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'pair not found' })
    }
    await requireRecordPermission(event, 'pairs', 'update', existing)
    const clash = await db.query.pairs.findFirst({ where: { AND: [{ path }, { id: { ne: pairId } }] }, columns: { id: true } })
    if (clash) {
      throw createError({ statusCode: 409, statusMessage: `a pair already exists at ${path}` })
    }
    const updated = await db.update(pairs).set(row).where(eq(pairs.id, pairId)).returning({ id: pairs.id })
    if (updated.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'pair not found' })
    }
  }
  else {
    // create — new pairs belong to their creator (unless policy changes later)
    if (!userCan(user, 'pairs', 'create')) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: missing permission pairs:create' })
    }
    await db.insert(pairs).values({ ...row, userId: user.userId })
      .onConflictDoUpdate({ target: pairs.path, set: row })
  }

  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
