// PUT /api/users/:id — rename / re-email / verify toggle
import { z } from 'zod'
import { updateUser } from '../../utils/users'
import { requirePermission } from '../../utils/permissions'
import { publishChange } from '../../utils/change-bus'

const bodySchema = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  emailVerified: z.boolean().optional(),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/, 'unknown role(s)').optional(),
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users', 'update')
  const id = getRouterParam(event, 'id') ?? ''
  const body: unknown = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  }
  if (parsed.data.role !== undefined) {
    await requirePermission(event, 'roles', 'update')
  }
  await updateUser(id, parsed.data)
  await publishChange('users', 'update')
  return { ok: true }
})
