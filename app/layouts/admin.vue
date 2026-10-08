<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <!-- ===================== LOGIN ===================== -->
    <div v-if="!session" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-2 text-center">
          <div class="flex size-12 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <UIcon name="i-lucide-arrow-left-right" class="size-6 text-inverted" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Pathbridge
            <span class="font-mono align-middle text-xs font-normal text-zinc-400">v{{ appVersion }}</span>
          </h1>
          <p class="text-sm text-zinc-500">Path forwarding for external upstreams</p>
        </div>

        <UCard :ui="{ root: 'shadow-sm' }">
          <UForm v-if="authConfig?.passwordEnabled !== false" :state="loginState" class="space-y-4" @submit="login">
            <UFormField label="Email" name="email">
              <UInput v-model="loginState.email" type="email" icon="i-lucide-mail" placeholder="you@example.com" class="w-full" size="lg" required />
            </UFormField>
            <UFormField label="Password" name="password">
              <UInput v-model="loginState.password" type="password" icon="i-lucide-lock" class="w-full" size="lg" required />
            </UFormField>
            <UAlert v-if="loginError" icon="i-lucide-shield-alert" color="error" variant="subtle" :title="loginError" />
            <UButton type="submit" block size="lg" :loading="busy" label="Sign in" />
          </UForm>
          <UButton
            v-for="prov in (authConfig?.providers ?? [])"
            :key="prov.id"
            block size="lg" variant="outline" icon="i-lucide-key-round"
            :label="`Sign in with ${prov.label}`"
            class="mt-3"
            @click="oidcLogin(prov.id)"
          />
        </UCard>
      </div>
    </div>

    <!-- ===================== APP (dashboard shell) ===================== -->
    <UDashboardGroup v-else unit="rem">
      <UDashboardSidebar id="admin-sidebar" :min-size="14" :default-size="16" :max-size="22" collapsible resizable>
        <template #header="{ collapsed }">
          <NuxtLink to="/admin" class="flex items-center gap-2.5 min-w-0">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <UIcon name="i-lucide-arrow-left-right" class="size-5 text-primary" />
            </div>
            <div v-if="!collapsed" class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-white">Pathbridge
                <span class="font-mono text-[10px] font-normal text-zinc-400">v{{ appVersion }}</span>
              </span>
              <span class="text-xs leading-tight text-zinc-400">{{ activeRouteCount }} active routes</span>
            </div>
          </NuxtLink>
        </template>

        <template #default="{ collapsed }: { collapsed: boolean }">
          <UNavigationMenu
            :collapsed="collapsed"
            orientation="vertical"
            :items="navItems"
            class="mt-2"
          />
        </template>

        <template #footer="{ collapsed }: { collapsed: boolean }">
          <UDropdownMenu v-if="!collapsed" :items="userMenuItems" :content="{ align: 'start', side: 'top' }" class="w-full">
            <UButton variant="ghost" color="neutral" class="w-full justify-start" icon="i-lucide-circle-user" trailing-icon="i-lucide-chevrons-up-down">
              <span class="max-w-40 truncate">{{ session.user.name || session.user.email }}</span>
            </UButton>
          </UDropdownMenu>
          <UTooltip v-else text="Profile">
            <UButton variant="ghost" color="neutral" icon="i-lucide-circle-user" @click="openProfile" />
          </UTooltip>
        </template>
      </UDashboardSidebar>

      <UDashboardPanel :ui="{ body: 'gap-0 py-0' }">
        <template #header>
          <UDashboardNavbar :ui="{ left: 'ms-0' }">
            <template #left>
              <UDashboardSidebarToggle class="lg:hidden" />
              <span class="text-sm font-semibold text-zinc-900 dark:text-white sm:hidden">Pathbridge</span>
            </template>
          </UDashboardNavbar>
        </template>
        <template #body>
          <div class="p-4 sm:p-6 lg:p-8">
            <slot />
          </div>
        </template>
      </UDashboardPanel>
    </UDashboardGroup>

    <!-- profile modal -->
    <ProfileModal v-model:open="profileOpen" />
  </div>
</template>

<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
const { session, authConfig, appVersion, can, loadPerms, logout } = await useAdminSession()
const toast = useToast()

// login form
const loginState = reactive({ email: '', password: '' })
const loginError = ref('')
const busy = ref(false)

// auth-config + version resolved during SSR by the composable already on layout;
// ensure they're loaded (layout runs before pages)
if (!authConfig.value) await loadAuthConfigSafe()
if (appVersion.value === 'dev') await loadVersionSafe()

async function loadAuthConfigSafe() {
  try { authConfig.value = await $fetch('/api/auth-config') }
  catch { authConfig.value = { passwordEnabled: true, oidcEnabled: false, providers: [] } }
}
async function loadVersionSafe() {
  try { appVersion.value = (await $fetch<{ version: string }>('/api/version')).version }
  catch { appVersion.value = 'dev' }
}

// live route count for the sidebar subtitle
const { $orpc } = useNuxtApp()
const routeCountQuery = useQuery({
  ...($orpc as any).routes.count.queryOptions(),
  enabled: can('routes', 'read'),
})
const activeRouteCount = computed(() => (unref(routeCountQuery.data) as { count: number } | undefined)?.count ?? 0)

// nav
const route = useRoute()
const navItems = computed(() => [
  { label: 'Routes', icon: 'i-lucide-route', to: '/admin', exact: true },
  { label: 'Logs', icon: 'i-lucide-scroll-text', to: '/admin/logs', exact: true, show: can('logs', 'read') },
  { label: 'Users', icon: 'i-lucide-users', to: '/admin/users', exact: true, show: can('users', 'read') },
  { label: 'Roles', icon: 'i-lucide-shield', to: '/admin/roles', exact: true, show: can('roles', 'read') },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/settings', exact: true, show: can('settings', 'read') },
].filter(i => i.show !== false))

const userMenuItems = computed(() => [[
  { label: session.value?.user.email ?? '', icon: 'i-lucide-user', disabled: true, class: 'opacity-60' },
  { label: 'Profile', icon: 'i-lucide-id-card', onSelect: openProfile },
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: doLogout },
]])

const profileOpen = ref(false)
function openProfile() { profileOpen.value = true }
async function doLogout() {
  await logout()
  toast.add({ title: 'Signed out', color: 'neutral' })
}

async function login() {
  busy.value = true
  loginError.value = ''
  try {
    const res = await useAuth().signIn.email({ email: loginState.email, password: loginState.password })
    if (res.error) throw new Error(res.error.message || 'invalid credentials')
    const s = await $fetch<SessionPayload | null>('/auth/get-session')
    session.value = s?.user ? s : null
    await loadPerms()
  }
  catch {
    loginError.value = 'Invalid email or password'
  }
  busy.value = false
}

async function oidcLogin(providerId: string) {
  try {
    const res = await $fetch<{ url: string }>('/auth/sign-in/social', {
      method: 'POST',
      body: { provider: providerId, callbackURL: '/admin' },
    })
    if (res?.url) window.location.href = res.url
    else throw new Error('no authorization url returned')
  }
  catch {
    toast.add({ title: 'SSO unavailable', description: 'OIDC provider not reachable', color: 'error' })
  }
}


</script>
