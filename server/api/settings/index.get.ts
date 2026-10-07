// GET /api/settings — auth required. OIDC providers live at /api/oidc.
import { getSettings } from '../../utils/settings'
import { requirePermission } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'read')
  const s = await getSettings()
  return {
    disablePasswordLogin: s.disablePasswordLogin,
    logRetentionDays: s.logRetentionDays,
  }
})
