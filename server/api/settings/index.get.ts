// GET /api/settings — auth required. oidcClientSecret masked.
import { getSettings } from '../../utils/settings'
import { requireSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireSession(event)
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
