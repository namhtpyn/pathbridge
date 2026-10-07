// GET /api/keys — list the CURRENT user's API keys (no secrets; hashed at rest anyway).
import { getAuth } from '../../utils/auth'
import { requirePermission } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'read')
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as unknown as Headers })
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const res = await auth.api.listApiKeys({ headers: event.node.req.headers as unknown as Headers })
  return { keys: res.apiKeys ?? [] }
})
