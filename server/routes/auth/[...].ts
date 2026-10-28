// Mount better-auth under /auth/* — basePath is /auth in the auth config,
// so the handler expects the FULL original path; no rewriting needed.
import { resolveAuthPolicy, anyUserExists, getAuth } from '../../lib/auth'
import type { H3Event } from 'h3'

function headerValue(v: string | string[] | undefined) {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}

function buildIncomingRequest(event: H3Event, body: ArrayBuffer | undefined) {
  const headers = event.node.req.headers
  const host = headers.host ?? 'localhost'
  const proto = headerValue(headers['x-forwarded-proto']) ?? 'http'
  const full = event.node.req.url ?? '/'

  const method = event.method
  const hasBody = method !== 'GET' && method !== 'HEAD' && body !== undefined && body.byteLength > 0
  return new Request(`${proto}://${host}${full}`, {
    method,
    headers: new Headers(Object.entries(headers).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map(item => [k, item] as [string, string]) : [[k, v] as [string, string]],
    )),
    body: hasBody ? body : undefined,
    // duplex is required by undici when sending request bodies
    ...(hasBody ? { duplex: 'half' as const } : {}),
  })
}

export default defineEventHandler(async (event) => {
  // Runtime policy gate (DB-backed, editable in Settings):
  //  - password sign-in rejected when password login is disabled
  //  - OIDC endpoints 404 unless OIDC is fully configured
  const full = event.node.req.url ?? ''
  // normalize ONCE: `/auth/sign-up/./email` reaches better-auth as the sign-up
  // path, so matching the raw url would skip the gate; query strings would make
  // a substring match fire on unrelated paths
  const path = new URL(full, 'http://localhost').pathname
  // public deployments: password sign-up closes after the first user claims the
  // instance. OIDC user creation is NOT gated (admin enabled the provider).
  if (event.method === 'POST' && path === '/auth/sign-up/email') {
    if (await anyUserExists()) {
      throw createError({ statusCode: 403, statusMessage: 'sign-up is closed' })
    }
  }
  if (event.method === 'POST' && path === '/auth/sign-in/email') {
    const { passwordEnabled } = await resolveAuthPolicy()
    if (!passwordEnabled) {
      throw createError({ statusCode: 403, statusMessage: 'password login is disabled' })
    }
  }
  // profile RBAC gate: self-service endpoints are a permission (resource `profile`,
  // statements read:own / update:own) — enforced here in the wrapper, NOT inside
  // better-auth hooks (a hook re-resolving the user through the session store
  // deadlocks the request pipeline).
  const isProfileRead = path === '/auth/get-session' || path === '/auth/list-sessions'
  const isProfileUpdate = event.method === 'POST' && (
    path === '/auth/update-user'
    || path === '/auth/change-password'
    || path === '/auth/delete-user'
    || path === '/auth/revoke-session'
    || path === '/auth/change-email'
    || path === '/auth/link-social'
    || path === '/auth/unlink-account'
  )
  if (isProfileRead || isProfileUpdate) {
    const { requireUser, userCan } = await import('../../lib/permissions')
    try {
      const { user } = await requireUser(event as never)
      const action = isProfileUpdate ? 'update' : 'read'
      if (!userCan(user, 'profile', action, 'own')) {
        throw createError({ statusCode: 403, statusMessage: `missing permission profile:${action}:own` })
      }
    }
    catch (e) {
      // no session -> let better-auth answer with its own 401 (uniform errors);
      // ANY other failure (403, 500, DB hiccup) must fail closed, never skip
      // the permission check.
      if ((e as { statusCode?: number }).statusCode !== 401) throw e
    }
  }

  const raw = event.method !== 'GET' && event.method !== 'HEAD'
    ? await readRawBody(event, false)
    : undefined

  let body: ArrayBuffer | undefined
  if (raw) {
    body = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  }

  const auth = await getAuth()
  const res = await auth.handler(buildIncomingRequest(event, body))

  for (const cookie of res.headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
  res.headers.forEach((v, k) => { if (k !== 'set-cookie') setResponseHeader(event, k, v) })
  setResponseStatus(event, res.status)
  if (res.body) {
    return new Uint8Array(await res.arrayBuffer())
  }
  return null
})
