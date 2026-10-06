// POST /api/users — create user (auth required, strict zod)
import { z } from 'zod'
import { createUser } from '../../utils/users'
import { requireSession } from '../../utils/session'

const bodySchema = z.strictObject({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
})

export default defineEventHandler(async (event) => {
  await requireSession(event)
  const body: unknown = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid user payload',
    })
  }
  try {
    await createUser(parsed.data.email, parsed.data.name, parsed.data.password)
    return { ok: true }
  }
  catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'email already in use' : 'create failed'
    throw createError({ statusCode: 409, statusMessage: msg })
  }
})
