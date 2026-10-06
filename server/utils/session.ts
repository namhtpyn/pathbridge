// Session guard for internal APIs — returns the typed session or throws 401.
import type { H3Event } from 'h3'
import { auth } from './auth'
import type { Session } from './auth'

export type AppSession = Session

export async function requireSession(event: H3Event): Promise<AppSession> {
  // node's IncomingHttpHeaders → standard Headers
  const headers = new Headers()
  for (const [k, v] of Object.entries(event.node.req.headers)) {
    if (v === undefined) continue
    if (Array.isArray(v)) for (const item of v) headers.append(k, item)
    else headers.set(k, v)
  }

  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return session
}
