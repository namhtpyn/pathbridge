// GET /api/auth-session — session payload for the admin shell during SSR.
// Exists because the better-auth vue client resolves its baseURL from
// useRequestURL().origin: behind the reverse proxy that origin is the PUBLIC
// https origin, so the SSR "session" fetch looped out through nginx with the
// cookie header silently dropped — every server-rendered page rendered the
// login shell for signed-in users (and the client-side swap left the login
// wrapper's `p-6` centering around the dashboard: phantom side padding on
// mobile). This endpoint resolves the session IN-PROCESS with the incoming
// headers — no outbound fetch, no proxy in the path.
import { getAuth } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await getAuth()
  const headers = new Headers()
  getRequestHeaders(event).cookie && headers.set('cookie', getRequestHeaders(event).cookie)
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    session: { expiresAt: session.session.expiresAt },
  }
})
