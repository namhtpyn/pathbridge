// meta module: public capabilities, version, session payload, me
import { ORPCError } from '@orpc/server'
import { base, withUser, eventFromContext, vocabularyOut } from '../shared/context'

export const metaRouter = {
  /** public auth capabilities for the login screen */
  authConfig: base.handler(async () => {
    const { resolveAuthPolicy } = await import('../../lib/auth')
    const p = await resolveAuthPolicy()
    return {
      passwordEnabled: p.passwordEnabled,
      oidcEnabled: p.oidcEnabled,
      providers: p.oidcProviders.map(x => ({ id: x.id, label: x.label })),
    }
  }),

  /** build version (baked APP_VERSION) */
  version: base.handler(() => ({ version: process.env.APP_VERSION || 'dev' })),

  /** session payload for the admin shell; null when signed out (SSR-safe) */
  session: base.handler(async ({ context }) => {
    const { requireUser, userCan } = await import('../../lib/permissions')
    try {
      const { session, user } = await requireUser(eventFromContext(context))
      // signed in but not allowed to read their own profile: no session surface
      if (!userCan(user, 'profile', 'read', 'own')) return null
      return {
        user: { id: session.user.id, name: session.user.name, email: session.user.email },
        session: { expiresAt: session.session.expiresAt.toISOString() },
      }
    }
    catch (e: unknown) {
      // only an auth failure is the normal signed-out case; an infra failure must
      // never be reported as a logout (the shell would silently drop the session)
      const err = e as { statusCode?: number, status?: number }
      if ((err.statusCode ?? err.status) === 401) return null
      console.error('[meta] session lookup failed:', e instanceof Error ? e.message : e)
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'session lookup failed' })
    }
  }),

  me: base.use(withUser).handler(async ({ context }) => ({
    id: context.user.userId,
    email: context.user.email,
    roles: context.user.roles,
    permissions: Object.fromEntries([...context.user.grants].map(([r, st]) => [r, [...st]])),
    vocabulary: await vocabularyOut(),
  })),
}
