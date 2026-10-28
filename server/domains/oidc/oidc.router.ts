// oidc module router: provider registry (settings-gated)
import { z } from 'zod'
import { base, withPerm, badRequest } from '../shared/context'

const oidcProviderInput = z.strictObject({
  /**
   * EXISTING provider id only — used to match the stored provider and keep
   * its callback path stable. New providers MUST omit it entirely: the id
   * (and thus the /auth/callback/:id path) is ALWAYS generated server-side
   * with crypto.randomUUID(); client-chosen ids for new providers would
   * let a caller craft callback paths.
   */
  id: z.string().min(2).max(36).optional(),
  label: z.string().trim().min(1).max(64),
  issuer: z.url().max(512).refine(u => /^https?:\/\//i.test(u), 'issuer must be an http(s) URL'),
  clientId: z.string().trim().min(1).max(255),
  clientSecret: z.string().max(512).optional(),
})

const oidcSaveInput = z.strictObject({
  providers: z.array(oidcProviderInput).max(20),
})

export const oidcRouter = {
  list: base.use(withPerm('settings', 'read')).handler(async () => {
    const { getOidcProviders, providersToPublic } = await import('./oidc.service')
    return { providers: providersToPublic(await getOidcProviders()) }
  }),

  save: base.use(withPerm('settings', 'update')).input(oidcSaveInput).handler(async ({ input }) => {
    const { getOidcProviders, setOidcProviders, providersToPublic, validProviderId, newProviderId } = await import('./oidc.service')
    type OidcProvider = import('./oidc.service').OidcProvider
    const { rebuildAuth } = await import('../../lib/auth')
    const existing = await getOidcProviders()
    const out: OidcProvider[] = []
    const seen = new Set<string>()
    for (const p of input.providers) {
      const incomingId = p.id?.trim().toLowerCase() ?? ''
      // an id is only accepted when it matches an EXISTING provider (keeps its
      // callback path stable); anything else is a NEW provider whose id is
      // generated here, server-side — never taken from the request body
      const prevId = existing.find(e => e.id === incomingId)
      // a supplied id that matches nothing is a caller error: generating a fresh
      // id would drop that provider's stored config AND change its callback path
      if (p.id && !prevId) badRequest(`unknown provider id: ${p.id}`)
      const id = prevId ? incomingId : newProviderId()
      if (!validProviderId(id)) {
        // legacy slug ids (e.g. the migrated single 'oidc' provider) are not
        // uuids; accept them ONLY when they already exist in storage
        const isStoredLegacy = prevId !== undefined && id === incomingId
        if (!isStoredLegacy) badRequest(`invalid provider id: ${id}`)
      }
      if (seen.has(id)) badRequest(`duplicate provider id: ${id}`)
      seen.add(id)
      const prev = existing.find(e => e.id === id)
      const clientSecret = p.clientSecret && p.clientSecret.length > 0 ? p.clientSecret : (prev?.clientSecret ?? '')
      if (!clientSecret) badRequest(`client secret required for ${id} (or stored previously)`)
      out.push({ id, label: p.label.trim(), issuer: p.issuer.trim().replace(/\/+$/, ''), clientId: p.clientId.trim(), clientSecret })
    }
    if (out.length === 0) {
      const { getSettings } = await import('../settings/settings.service')
      const settings = await getSettings()
      if (settings.disablePasswordLogin) {
        badRequest('cannot remove the last OIDC provider while password login is disabled — enable password login first')
      }
    }
    await setOidcProviders(out)
    try {
      await rebuildAuth() // discovery for new providers runs at auth build
    }
    catch (e) {
      // a bad discovery must not leave a stored config the runtime cannot serve:
      // restore the previous list, rebuild back onto it, then surface the failure
      await setOidcProviders(existing)
      await rebuildAuth()
      throw e
    }
    const { publishChange } = await import('../../lib/change-bus')
    await publishChange('settings', 'update')
    return { providers: providersToPublic(out) }
  }),
}
