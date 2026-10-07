// GET /api/settings — auth required. oidcClientSecret masked.
import { getSettings } from '../../utils/settings'
import { requirePermission } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'read')
  const s = await getSettings()
  return {
    oidcIssuer: s.oidcIssuer,
    oidcClientId: s.oidcClientId,
    oidcClientSecretSet: s.oidcClientSecret !== '',
    disablePasswordLogin: s.disablePasswordLogin,
    logRetentionDays: s.logRetentionDays,
    envOidc: Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET),
  }
})
