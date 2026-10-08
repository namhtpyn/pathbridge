// PUT /api/oidc — replace the whole provider list.
// Body: { providers: [{ id, label, issuer, clientId, clientSecret? }] }
// clientSecret omitted/empty on an existing id = keep stored secret.
// Permission: settings:update.
import { z } from 'zod'
import { getOidcProviders, setOidcProviders, validProviderId, newProviderId, type OidcProvider } from '../../utils/oidc'
import { rebuildAuth } from '../../utils/auth'

const bodySchema = z.object({
  providers: z.array(z.object({
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
  })).max(20),
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings', 'update')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid provider payload' })
  const incoming = parsed.data.providers

  const existing = await getOidcProviders()
  const out: OidcProvider[] = []
  const seen = new Set<string>()
  for (const p of incoming) {
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
      if (!isStoredLegacy) throw createError({ statusCode: 400, statusMessage: `invalid provider id: ${id}` })
    }
    if (seen.has(id)) throw createError({ statusCode: 400, statusMessage: `duplicate provider id: ${id}` })
    seen.add(id)
    const prev = existing.find(e => e.id === id)
    const clientSecret = p.clientSecret && p.clientSecret.length > 0 ? p.clientSecret : (prev?.clientSecret ?? '')
    if (!clientSecret) throw createError({ statusCode: 400, statusMessage: `client secret required for ${id} (or stored previously)` })
    out.push({ id, label: p.label.trim(), issuer: p.issuer.trim().replace(/\/+$/, ''), clientId: p.clientId.trim(), clientSecret })
  }
  await setOidcProviders(out)
  await rebuildAuth() // discovery for new providers runs at auth build
  return { providers: out.map(({ clientSecret: _s, ...rest }) => ({ ...rest, secretSet: true })) }
})
