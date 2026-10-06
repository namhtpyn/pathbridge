// PUT /api/users/:id/password — set new password (admin reset)
import { z } from 'zod'
import { setPassword } from '../../../utils/users'
import { requireSession } from '../../../utils/session'

const bodySchema = z.strictObject({ password: z.string().min(8).max(128) })

export default defineEventHandler(async (event) => {
  await requireSession(event)
  const id = getRouterParam(event, 'id') ?? ''
  const body: unknown = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'password must be 8-128 chars' })
  }
  await setPassword(id, parsed.data.password)
  return { ok: true }
})
