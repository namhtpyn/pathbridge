import { listRoles, requirePermission } from '../../utils/permissions'


export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles', 'read')
  const rows = await listRoles()
  return { roles: rows, vocabulary: STATEMENTS }
})
