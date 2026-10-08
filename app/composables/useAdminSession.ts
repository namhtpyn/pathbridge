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
  const authConfig = useState<AuthConfig | null>('admin:auth-config', () => null)
  const appVersion = useState<string>('admin:version', () => 'dev')
  const booted = useState<boolean>('admin:booted', () => false)
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
      const me = await $fetch<{ permissions: Record<string, string[]> }>('/api/me', { headers: ssrHeaders.value })
      perms.value = me.permissions ?? {}
    }
    catch (e) {
      if (import.meta.server) console.warn('[admin-session] loadPerms failed:', e instanceof Error ? e.message : e)
      perms.value = {}
    }
  }

  async function loadAuthConfig() {
    try {
      authConfig.value = await $fetch<AuthConfig>('/api/auth-config', { headers: ssrHeaders.value })
    }
    catch {
      authConfig.value = { passwordEnabled: true, oidcEnabled: false, providers: [] }
    }
  }

  async function loadVersion() {
    try {
      appVersion.value = (await $fetch<{ version: string }>('/api/version', { headers: ssrHeaders.value })).version
    }
    catch { appVersion.value = 'dev' }
  }

  /** Resolve session during SSR via better-auth's Nuxt integration. */
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

  return { session, perms, authConfig, appVersion, can, loadPerms, loadAuthConfig, loadVersion, logout }
}

/** shared row type re-export for pages */
export type { RouteRow }
