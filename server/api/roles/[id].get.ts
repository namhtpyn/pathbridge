import { db } from '../../db'
import { roles as rolesTable } from '../../db/schema'
import { validateStatements, requirePermission } from '../../utils/permissions'
import { eq } from 'drizzle-orm'


export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles', 'read')
  const id = getRouterParam(event, 'id') ?? ''
  const row = await db.query.roles.findFirst({ where: { id } })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Role not found' })
  return { role: row }
})
