// PUT /api/settings — auth required. Strict zod.
// OIDC providers are managed via /api/oidc (multi-provider registry).
import { z } from 'zod'
import { setSetting, getSettings } from '../../utils/settings'
import { rebuildAuth } from '../../utils/auth'
import { requirePermission } from '../../utils/permissions'
import { getOidcProviders } from '../../utils/oidc'
import { publishChange } from '../../utils/change-bus'

const bodySchema = z.strictObject({
  disablePasswordLogin: z.boolean().optional(),
  logRetentionDays: z.number().int().min(0).max(3650).optional(),
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'update')
  const body: unknown = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid settings payload',
    })
  }
  const d = parsed.data

  // disabling password login requires at least one fully-configured provider
  if (d.disablePasswordLogin === true) {
    const providers = await getOidcProviders()
    if (providers.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'configure an OIDC provider before disabling password login' })
    }
  }

  const entries = Object.entries(d) as Array<[string, string | number | boolean]>
  for (const [k, v] of entries) await setSetting(k as 'logRetentionDays', v)
  await rebuildAuth() // password-toggle affects the auth build
  await publishChange('settings', 'update')
  return { ok: true }
})
