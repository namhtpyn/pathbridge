// GET /health/ready — readiness: the bridge re-queries routes on EVERY proxied
// request (no cache), so a broken database means broken forwarding even while
// the process is alive. This probe answers "can the app actually serve".
import { sql } from 'drizzle-orm'
import { db } from '../../db'

export default defineEventHandler(async () => {
  try {
    await db.run(sql`select 1`)
    return { ok: true, db: true }
  }
  catch (e) {
    console.error('[health] readiness db probe failed:', e instanceof Error ? e.message : e)
    throw createError({ statusCode: 503, statusMessage: 'database unreachable' })
  }
})
