// DELETE /api/users/:id — delete user + sessions + accounts. Cannot delete
// yourself (last-admin lockout guard).
import { deleteUser } from '../../utils/users'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const sess = await requireSession(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (id === sess.user.id) {
    throw createError({ statusCode: 400, statusMessage: 'cannot delete your own account' })
  }
  await deleteUser(id)
  return { ok: true }
})
