// PUT /api/users/:id — rename / re-email / verify toggle
import { z } from 'zod'
import { updateUser } from '../../utils/users'
import { requireSession } from '../../utils/session'

const bodySchema = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  emailVerified: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  await requireSession(event)
  const id = getRouterParam(event, 'id') ?? ''
  const body: unknown = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  }
  await updateUser(id, parsed.data)
  return { ok: true }
})
