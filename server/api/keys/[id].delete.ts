// DELETE /api/keys/:id — revoke one of the CURRENT user's keys.
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
  // verify ownership before revoking
  const list = await auth.api.listApiKeys({ headers: event.node.req.headers as unknown as Headers })
  const owned = (list.apiKeys ?? []).find(k => k.id === id)
  if (!owned) throw createError({ statusCode: 404, statusMessage: 'key not found' })
  await auth.api.deleteApiKey({ body: { keyId: id } })
  await publishChange('keys', 'delete')
  return { ok: true }
})
