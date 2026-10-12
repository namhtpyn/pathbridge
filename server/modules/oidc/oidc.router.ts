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
  label: z.string().min(1).max(64),
  issuer: z.string().url().max(512),
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().max(512).optional(),
})

const oidcSaveInput = z.strictObject({
  providers: z.array(oidcProviderInput).max(20),
})

export const oidcRouter = {
  list: base.use(withPerm('settings', 'read')).handler(async () => {
    const { getOidcProviders, providersToPublic } = await import('../../utils/oidc')
    return { providers: providersToPublic(await getOidcProviders()) }
  }),

  save: base.use(withPerm('settings', 'update')).input(oidcSaveInput).handler(async ({ input }) => {
    const { getOidcProviders, setOidcProviders, validProviderId, newProviderId } = await import('../../utils/oidc')
    type OidcProvider = import('../../utils/oidc').OidcProvider
    const { rebuildAuth } = await import('../../utils/auth')
    const existing = await getOidcProviders()
    const out: OidcProvider[] = []
    const seen = new Set<string>()
    for (const p of input.providers) {
      const incomingId = p.id?.trim().toLowerCase() ?? ''
      // an id is only accepted when it matches an EXISTING provider (keeps its
      // callback path stable); anything else is a NEW provider whose id is
      // generated here, server-side — never taken from the request body
      const prevId = existing.find(e => e.id === incomingId)
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
    await setOidcProviders(out)
    await rebuildAuth() // discovery for new providers runs at auth build
    return { providers: out.map(({ clientSecret: _s, ...rest }) => ({ ...rest, secretSet: true })) }
  }),
}
