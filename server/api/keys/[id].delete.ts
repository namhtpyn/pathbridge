// DELETE /api/keys/:id — revoke one of the CURRENT user's keys.
// auth.api.deleteApiKey resolves the caller from request headers; without them
// (server-side call) it 401s, so we verify session + ownership ourselves and
// delete the row directly through the same table the plugin owns.
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { apiKey } from '../../db/schema'
import { getAuth } from '../../utils/auth'
import { requirePermission } from '../../utils/permissions'
import { publishChange } from '../../utils/change-bus'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'read')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'key id required' })
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as unknown as Headers })
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  // verify ownership before revoking (key must belong to the caller)
  const owned = (await db.select().from(apiKey).where(eq(apiKey.id, id)))[0]
  if (!owned || owned.referenceId !== session.user.id) throw createError({ statusCode: 404, statusMessage: 'key not found' })
  await db.delete(apiKey).where(eq(apiKey.id, id))
  await publishChange('keys', 'delete')
  return { ok: true }
})
