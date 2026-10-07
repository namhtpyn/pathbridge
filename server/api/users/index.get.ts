// GET /api/users — list users (auth required)
import { listUsers } from '../../utils/users'
import { requirePermission } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users', 'read')
  return { users: await listUsers() }
})
