// meta module: public capabilities, version, session payload, me
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
    const { requireSession } = await import('../../lib/session')
    try {
      const session = await requireSession(eventFromContext(context))
      return {
        user: { id: session.user.id, name: session.user.name, email: session.user.email },
        session: { expiresAt: session.session.expiresAt.toISOString() },
      }
    }
    catch (e: unknown) {
      // signed-out is the normal case (null); anything else is a real failure
      const status = (e as { statusCode?: number }).statusCode
      if (status !== 401) console.error('[meta] session lookup failed:', e instanceof Error ? e.message : e)
      return null
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
