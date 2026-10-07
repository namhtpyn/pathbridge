// PUT /api/oidc — replace the whole provider list.
// Body: { providers: [{ id, label, issuer, clientId, clientSecret? }] }
// clientSecret omitted/empty on an existing id = keep stored secret.
// Permission: settings:update.
import { z } from 'zod'
import { getOidcProviders, setOidcProviders, validProviderId, type OidcProvider } from '../../utils/oidc'
import { rebuildAuth } from '../../utils/auth'

const bodySchema = z.object({
  providers: z.array(z.object({
    id: z.string().min(2).max(32),
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
    const id = p.id.trim().toLowerCase()
    if (!validProviderId(id)) throw createError({ statusCode: 400, statusMessage: `invalid provider id: ${id}` })
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
