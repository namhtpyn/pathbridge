// DELETE /api/users/:id — delete user + sessions + accounts. Cannot delete
// yourself (last-admin lockout guard).
import { deleteUser } from '../../utils/users'
import { requirePermission } from '../../utils/permissions'
import { publishChange } from '../../utils/change-bus'

export default defineEventHandler(async (event) => {
  const sess = await requirePermission(event, 'users', 'delete')
  const id = getRouterParam(event, 'id') ?? ''
  if (id === sess.userId) {
    throw createError({ statusCode: 400, statusMessage: 'cannot delete your own account' })
  }
  await deleteUser(id)
  await publishChange('users', 'delete')
  return { ok: true }
})
