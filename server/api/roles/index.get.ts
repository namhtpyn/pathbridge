import { db } from '../../db'
import { roles as rolesTable } from '../../db/schema'
import { listRoles, validateStatements, STATEMENTS, requirePermission } from '../../utils/permissions'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,31}$/

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'roles', 'read')
  const rows = await listRoles()
  return { roles: rows, vocabulary: STATEMENTS }
})
