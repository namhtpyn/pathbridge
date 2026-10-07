// POST /api/keys — create an API key for the CURRENT user, optionally scoped.
// permissions are server-only on the better-auth plugin, so creation goes
// through the server auth instance here. Key permissions can only NARROW the
// owner's grants (enforced at resolve time in permissions.ts requireUser).
import { z } from 'zod'
import { getAuth } from '../../utils/auth'
import { requirePermission, STATEMENTS } from '../../utils/permissions'

const stmt = z.string().regex(/^(read|create|update|delete):(own|all)$/)
const bodySchema = z.strictObject({
  name: z.string().min(1).max(64),
  expiresIn: z.number().int().positive().max(365 * 24 * 3600).optional(), // seconds; omit = no expiry
  permissions: z.record(z.string(), z.array(stmt)).optional(),
})

export default defineEventHandler(async (event) => {
  // any authenticated user can mint keys for THEMSELVES (key perms intersected with own role)
  await requirePermission(event, 'settings', 'read') // minimal gate: must be able to read settings (admins/operators); viewer-only roles get 403
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({ statusCode: 400, statusMessage: issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid key payload' })
  }
  const { name, expiresIn, permissions } = parsed.data

  // validate resource names + statements exist in the RBAC vocabulary
  const clean: Record<string, string[]> = {}
  if (permissions) {
    for (const [resource, statements] of Object.entries(permissions)) {
      if (!(resource in STATEMENTS)) throw createError({ statusCode: 400, statusMessage: `unknown resource: ${resource}` })
      for (const st of statements) {
        if (!STATEMENTS[resource as keyof typeof STATEMENTS].includes(st)) {
          throw createError({ statusCode: 400, statusMessage: `unknown statement ${resource}:${st}` })
        }
      }
      clean[resource] = statements
    }
  }

  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: event.node.req.headers as unknown as Headers })
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const res = await auth.api.createApiKey({
    body: {
      name,
      userId: session.user.id,
      ...(expiresIn ? { expiresIn } : {}),
      ...(Object.keys(clean).length > 0 ? { permissions: clean } : {}),
    },
  })
  return { key: res.key, referenceId: res.referenceId, name }
})
