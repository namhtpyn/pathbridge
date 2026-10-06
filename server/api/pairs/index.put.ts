// PUT /api/pairs — upsert one pair (auth required). Zod-validated input
// (backend security boundary); insert/upsert on the core API (RQB has no
// upsert); read-back via RQB.
import { db } from '../../db'
import { pairs } from '../../db/schema'
import type { PairRow } from '../../../shared/types'
import { pairInputSchema } from '../../utils/pair-schema'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event): Promise<{ pairs: PairRow[] }> => {
  await requireSession(event)
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
  const u = new URL(target) // re-parsed; schema guaranteed http(s) origin-only

  const row = {
    path,
    target: u.origin,
    upstreamHost: parsed.data.upstreamHost ?? null,
    stripPrefix: parsed.data.stripPrefix,
    methods: parsed.data.methods ? JSON.stringify(parsed.data.methods) : null,
    note: parsed.data.note !== undefined ? parsed.data.note.slice(0, 200) : null,
    enabled: parsed.data.enabled,
    updatedAt: new Date().toISOString(),
  }

  await db.insert(pairs).values(row)
    .onConflictDoUpdate({ target: pairs.path, set: row })

  const rows = await db.query.pairs.findMany({ orderBy: { path: 'asc' } })
  return { pairs: rows as unknown as PairRow[] }
})
