// PUT /api/settings — auth required. Strict zod; secret write-only.
import { z } from 'zod'
import { setSetting, getSettings } from '../../utils/settings'
import { rebuildAuth } from '../../utils/auth'
import { requirePermission } from '../../utils/permissions'

const bodySchema = z.strictObject({
  oidcIssuer: z.string().max(512).optional(),
  oidcClientId: z.string().max(255).optional(),
  oidcClientSecret: z.string().max(512).optional(),
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
  // disabling password login requires OIDC to be (newly) configured
  const after = await getSettings()
  const issuerAfter = d.oidcIssuer !== undefined ? d.oidcIssuer : after.oidcIssuer
  const clientAfter = d.oidcClientId !== undefined ? d.oidcClientId : after.oidcClientId
  const secretAfter = d.oidcClientSecret !== undefined && d.oidcClientSecret !== '' ? d.oidcClientSecret : after.oidcClientSecret
  if (d.disablePasswordLogin === true && !(issuerAfter !== '' && clientAfter !== '' && secretAfter !== '')) {
    throw createError({ statusCode: 400, statusMessage: 'cannot disable password login without a fully configured OIDC provider' })
  }
  for (const [k, v] of Object.entries(d)) {
    if (k === 'oidcClientSecret' && (v === undefined || v === '')) continue
    await setSetting(k as never, v as never)
  }
  await rebuildAuth() // re-init better-auth (OIDC discovery runs at init)
  return { ok: true }
})
