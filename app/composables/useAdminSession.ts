// Shared admin session state: session payload, effective permissions,
// auth-config (login form gates), app version. Lives in useState so the
// layout and every admin page share one copy across SSR + hydration.
import type { RouteRow } from '~/../shared/types'

export interface SessionUser { id: string, name?: string | null, email: string }
export interface SessionPayload { user: SessionUser, session: { expiresAt: string } }
export interface AuthConfig { passwordEnabled: boolean, oidcEnabled: boolean, providers: Array<{ id: string, label: string }> }

export async function useAdminSession() {
  const session = useState<SessionPayload | null>('admin:session', () => null)
  const perms = useState<Record<string, string[]>>('admin:perms', () => ({}))
  const vocabulary = useState<Record<string, string[]>>('admin:vocabulary', () => ({}))
  const authConfig = useState<AuthConfig | null>('admin:auth-config', () => null)
  const appVersion = useState<string>('admin:version', () => 'dev')
  const booted = useState<boolean>('admin:booted', () => false)
  // resolve the oRPC client ONCE here (composables run inside the Nuxt
  // context); loadPerms & co are later invoked from onMounted/login handlers
  // where useNuxtApp() would throw NUXT_E1001
  const client = useNuxtApp().$client as import('#app').NuxtApp['$client']
  // request cookies captured once by the ssr-headers plugin (layouts lack request context)
  const ssrHeaders = useState<Record<string, string> | undefined>('admin:ssr-headers', () => undefined)

  function can(resource: string, action: string, scope: 'own' | 'all' | 'any' = 'any'): boolean {
    const set = perms.value[resource] ?? []
    if (set.includes(`${action}:all`)) return true
    if (scope === 'any' || scope === 'own') return set.includes(`${action}:own`)
    return false
  }

  async function loadPerms() {
    try {
      // ADMIN PANEL LAW: oRPC procedures only (better-auth /auth/* excepted)
      const me = await client.me()
      perms.value = me.permissions ?? {}
      vocabulary.value = me.vocabulary ?? {}
    }
    catch (e) {
      if (import.meta.server) console.warn('[admin-session] loadPerms failed:', e instanceof Error ? e.message : e)
      perms.value = {}
    }
  }

  async function loadAuthConfig() {
    try {
      authConfig.value = await client.authConfig()
    }
    catch {
      authConfig.value = { passwordEnabled: true, oidcEnabled: false, providers: [] }
    }
  }

  async function loadVersion() {
    try {
      appVersion.value = (await client.version()).version
    }
    catch { appVersion.value = 'dev' }
  }

  /**
   * Resolve session during SSR via the oRPC `session` procedure: the
   * RPCLink runs in-process with the forwarded event headers, so the
   * request never loops out through the reverse proxy (nginx silently
   * dropped the cookie on that path — pages rendered as the login shell
   * for signed-in users; the client swap then left phantom padding).
   */
  if (import.meta.server) {
    const ssrHeaders = useState<Record<string, string> | undefined>('admin:ssr-headers', () => undefined)
    try {
      const s = await client.session() as SessionPayload | null
      if (s?.user) {
        session.value = s
        if (!booted.value) {
          await loadPerms()
          booted.value = true
        }
      }
    }
    catch { /* not signed in / resolver failed — client will retry */ }
  }
  else {
    const authClient = useAuth()
    const { data: ssrSession } = await authClient.useSession(useFetch)
    if (ssrSession.value) {
      session.value = ssrSession.value as unknown as SessionPayload
      if (!booted.value) {
        await loadPerms()
        booted.value = true
      }
    }
    watch(() => ssrSession.value, (s) => {
      session.value = (s ?? null) as unknown as SessionPayload | null
    })
  }

  onMounted(async () => {
    if (!session.value) {
      try {
        const s = await $fetch<SessionPayload | null>('/auth/get-session')
        session.value = s?.user ? s : null
        if (session.value) await loadPerms()
      }
      catch { /* not signed in */ }
    }
    if (!authConfig.value) await loadAuthConfig()
  })

  async function logout() {
    await useAuth().signOut().catch(() => {})
    session.value = null
    perms.value = {}
    await navigateTo('/admin')
  }

  return { session, perms, vocabulary, authConfig, appVersion, can, loadPerms, loadAuthConfig, loadVersion, logout }
}

/** shared row type re-export for pages */
export type { RouteRow }
