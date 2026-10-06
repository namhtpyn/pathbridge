// GET /api/users — list users (auth required)
import { listUsers } from '../../utils/users'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireSession(event)
  return { users: await listUsers() }
})
