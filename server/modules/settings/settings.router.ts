// settings module router
import { z } from 'zod'
import { base, withPerm, badRequest } from '../shared/context'

const settingsSaveInput = z.strictObject({
  disablePasswordLogin: z.boolean().optional(),
  logRetentionDays: z.number().int().min(0).max(3650).optional(),
})

export const settingsRouter = {
  get: base.use(withPerm('settings', 'read')).handler(async () => {
    const { getSettings } = await import('../../utils/settings')
    const s = await getSettings()
    // never expose secrets through the RPC surface (only the two public knobs)
    return { disablePasswordLogin: s.disablePasswordLogin, logRetentionDays: s.logRetentionDays }
  }),

  save: base.use(withPerm('settings', 'update')).input(settingsSaveInput).handler(async ({ input }) => {
    const { setSetting } = await import('../../utils/settings')
    const { rebuildAuth } = await import('../../utils/auth')
    const { publishChange } = await import('../../utils/change-bus')
    // disabling password login requires at least one fully-configured provider
    if (input.disablePasswordLogin === true) {
      const { getOidcProviders } = await import('../../utils/oidc')
      const providers = await getOidcProviders()
      if (providers.length === 0) badRequest('configure an OIDC provider before disabling password login')
    }
    for (const [k, v] of Object.entries(input)) await setSetting(k as 'logRetentionDays', v)
    await rebuildAuth()
    await publishChange('settings', 'update')
    return { ok: true }
  }),
}
