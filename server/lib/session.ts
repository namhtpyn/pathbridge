// Session guard for internal APIs — accepts a session cookie, a Bearer
// session-token (bearer plugin), or a Bearer API key (@better-auth/api-key).
import type { H3Event } from 'h3'
import { getAuth } from './auth'
import type { Session } from './auth'
import { db } from '../db'
import { parseKeyPermissions } from '../domains/keys/keys.service'

export type AppSession = Session & {
  /** parsed key scopes — the plugin persists them as (sometimes double-encoded) JSON text */
  apiKeyPermissions: Record<string, string[]> | null
}

export async function requireSession(event: H3Event) {
  // node's IncomingHttpHeaders -> standard Headers
  const headers = new Headers()
  for (const [k, v] of Object.entries(event.node.req.headers)) {
    if (v === undefined) continue
    if (Array.isArray(v)) for (const item of v) headers.append(k, item)
    else headers.set(k, v)
  }

  const auth = await getAuth()

  // API key path: Bearer <apiKey> (plain, no dot). Plugin-enforced: enabled,
  // expiry, rate limit, remaining count.
  const authz = headers.get('authorization')
  if (authz?.toLowerCase().startsWith('bearer ')) {
    const token = authz.slice(7).trim()
    if (!token.includes('.')) {
      const res = await auth.api.verifyApiKey({ body: { key: token } })
      if (res.valid) {
        const ownerId = res.key?.referenceId
        if (ownerId) {
          const u = await db.query.user.findFirst({ where: { id: ownerId } })
          if (u) {
            // json text column — double-encoded rows would otherwise parse to zero grants
            const rawPermissions: unknown = (res.key as { permissions?: unknown } | undefined)?.permissions ?? null
            return {
              user: {
                id: u.id,
                name: u.name,
                email: u.email,
                emailVerified: u.emailVerified,
                image: u.image ?? null,
                role: u.role ?? 'viewer',
              },
              session: {
                id: `apikey:${res.key?.id ?? ''}`,
                userId: u.id,
                expiresAt: res.key?.expiresAt instanceof Date ? res.key.expiresAt : new Date(8640000000000000),
              },
              // key-scoped permissions (same grammar as role statements). Never
              // expands access: permissions.ts intersects these with the owner
              // role's grants.
              apiKeyPermissions: parseKeyPermissions(rawPermissions),
            } as AppSession
          }
        }
      }
    }
  }

  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return session
}
