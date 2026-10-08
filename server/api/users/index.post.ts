// POST /api/users — create user (auth required, strict zod)
import { z } from 'zod'
import { createUser } from '../../utils/users'
import { requirePermission } from '../../utils/permissions'
import { publishChange } from '../../utils/change-bus'

const bodySchema = z.strictObject({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/, 'unknown role(s)').optional(),
  emailVerified: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users', 'create')
  const body: unknown = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid user payload',
    })
  }
  // assigning a role requires roles:update (viewer default otherwise)
  let role = 'viewer'
  if (parsed.data.role) {
    try {
      await requirePermission(event, 'roles', 'update')
      role = parsed.data.role
    } catch {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: missing permission roles:update (needed to assign a role)' })
    }
  }
  try {
    await createUser(parsed.data.email, parsed.data.name, parsed.data.password, role, parsed.data.emailVerified ?? true)
    await publishChange('users', 'create')
    return { ok: true }
  }
  catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'email already in use' : 'create failed'
    throw createError({ statusCode: 409, statusMessage: msg })
  }
})
