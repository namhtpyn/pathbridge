import { db } from '../../db'
import { roles as rolesTable } from '../../db/schema'
import { validateStatements, requirePermission } from '../../utils/permissions'
import { eq } from 'drizzle-orm'


export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles', 'delete')
  const id = getRouterParam(event, 'id') ?? ''
  const row = await db.query.roles.findFirst({ where: { id } })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Role not found' })
  if (row.builtin) throw createError({ statusCode: 400, statusMessage: 'builtin roles cannot be deleted' })
  const holders = await db.query.user.findMany({ where: { role: row.name } })
  if (holders.length > 0) {
    throw createError({ statusCode: 409, statusMessage: `role still assigned to ${holders.length} user(s)` })
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id))
  return { ok: true }
})
