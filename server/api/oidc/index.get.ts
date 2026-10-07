// GET /api/oidc — provider list for the Settings tab (no secrets).
// Permission: settings:read (same as /api/settings).
import { getOidcProviders, providersToPublic } from '../../utils/oidc'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'read')
  return { providers: providersToPublic(await getOidcProviders()) }
})
