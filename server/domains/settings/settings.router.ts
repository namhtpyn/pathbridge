// settings module router
import { z } from 'zod'
import { base, withPerm, badRequest } from '../shared/context'

const settingsSaveInput = z.strictObject({
  disablePasswordLogin: z.boolean().optional(),
  logRetentionDays: z.number().int().min(0).max(3650).optional(),
})

export const settingsRouter = {
  get: base.use(withPerm('settings', 'read')).handler(async () => {
    const { getSettings } = await import('./settings.service')
    const s = await getSettings()
    // never expose secrets through the RPC surface (only the two public knobs)
    return { disablePasswordLogin: s.disablePasswordLogin, logRetentionDays: s.logRetentionDays }
  }),

  save: base.use(withPerm('settings', 'update')).input(settingsSaveInput).handler(async ({ input }) => {
    const { getSettings, setSettings } = await import('./settings.service')
    const { rebuildAuth } = await import('../../lib/auth')
    const { publishChange } = await import('../../lib/change-bus')
    // disabling password login requires at least one fully-configured provider
    if (input.disablePasswordLogin === true) {
      const { getOidcProviders } = await import('../oidc/oidc.service')
      const providers = await getOidcProviders()
      if (providers.length === 0) badRequest('configure an OIDC provider before disabling password login')
    }
    const prev = await getSettings()
    // one transaction: a mid-patch failure must not half-apply the policy
    await setSettings(input)
    try {
      await rebuildAuth()
    }
    catch (e) {
      // a patch the runtime cannot serve (e.g. password login off + broken
      // discovery) must not persist: restore the previous values, rebuild back
      // onto them, then surface the failure — otherwise the panel locks out
      await setSettings({ disablePasswordLogin: prev.disablePasswordLogin, logRetentionDays: prev.logRetentionDays })
      await rebuildAuth()
      throw e
    }
    await publishChange('settings', 'update')
    return { ok: true }
  }),
}
