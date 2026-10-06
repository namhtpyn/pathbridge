<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <!-- ===================== LOGIN ===================== -->
    <div v-if="!session" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-2 text-center">
          <div class="flex size-12 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <UIcon name="i-lucide-arrow-left-right" class="size-6 text-inverted" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">pathbridge</h1>
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
          <UButton v-if="authConfig?.oidcEnabled" block size="lg" variant="outline" icon="i-lucide-key-round" label="Sign in with SSO" class="mt-3" @click="oidcLogin" />
        </UCard>
      </div>
    </div>

    <!-- ===================== APP ===================== -->
    <div v-else class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6">
      <!-- top bar -->
      <header class="flex h-16 shrink-0 items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <UIcon name="i-lucide-arrow-left-right" class="size-5 text-primary" />
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-semibold leading-tight text-zinc-900 dark:text-white">pathbridge</span>
            <span class="text-xs leading-tight text-zinc-400">{{ activePairCount }} active pairs</span>
          </div>
        </div>

        <UDropdownMenu :items="userMenuItems">
          <UButton variant="ghost" color="neutral" icon="i-lucide-circle-user" trailing-icon="i-lucide-chevrons-up-down">
            <span class="max-w-40 truncate">{{ session.user.name || session.user.email }}</span>
          </UButton>
        </UDropdownMenu>
      </header>

      <!-- tabs -->
      <nav class="flex shrink-0 items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <button
          v-for="t in tabs"
          :key="t.value"
          type="button"
          class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors"
          :class="tab === t.value
            ? 'border-primary text-primary'
            : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
          @click="tab = t.value"
        >
          <UIcon :name="t.icon" class="size-4" />
          {{ t.label }}
        </button>
      </nav>

      <!-- content -->
      <main class="flex-1 py-8">
        <!-- ============ PAIRS ============ -->
        <div v-if="tab === 'pairs'" class="space-y-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Pairs</h2>
              <p class="text-sm text-zinc-500">Route incoming paths to upstream origins</p>
            </div>
            <UButton icon="i-lucide-plus" label="New pair" @click="openEditor()" />
          </div>

          <UCard v-if="editing" :ui="{ root: 'shadow-sm' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">{{ editing === 'new' ? 'Create pair' : `Edit ${editing}` }}</h3>
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Close editor" @click="reset" />
              </div>
            </template>
            <UForm :state="form" :validate="validatePair" class="grid gap-5 sm:grid-cols-2" @submit="save">
              <UFormField label="Path" name="path" :help="pathHelp">
                <UInput v-model="form.path" placeholder="/hook or /hook/*" icon="i-lucide-slash" class="w-full" />
              </UFormField>
              <UFormField label="Target origin" name="target" help="Absolute URL, path optional">
                <UInput v-model="form.target" placeholder="https://api.example.com" icon="i-lucide-globe" class="w-full" />
              </UFormField>
              <UFormField label="Host header override" name="upstreamHost" help="Optional — defaults to target hostname">
                <UInput v-model="form.upstreamHost" placeholder="api.example.com" icon="i-lucide-server" class="w-full" />
              </UFormField>
              <UFormField label="Note" name="note" help="What this pair is for">
                <UInput v-model="form.note" placeholder="webhooks from partner X" icon="i-lucide-notebook-pen" class="w-full" />
              </UFormField>
              <div class="flex items-center gap-6 sm:col-span-2">
                <USwitch v-model="form.stripPrefix" label="Strip prefix" :disabled="!isWildcard" />
                <USwitch v-model="form.enabled" label="Enabled" />
              </div>
              <div class="flex justify-end gap-2 sm:col-span-2">
                <UButton variant="ghost" color="neutral" label="Cancel" @click="reset" />
                <UButton type="submit" :loading="busy" :label="editing === 'new' ? 'Add pair' : 'Save changes'" />
              </div>
            </UForm>
          </UCard>

          <UCard v-if="pairs.length" :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              <li v-for="p in pairs" :key="p.id" class="flex items-center gap-4 px-5 py-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <code class="rounded-md bg-primary/5 px-1.5 py-0.5 text-sm font-semibold text-primary">{{ p.path }}</code>
                    <UBadge v-if="p.stripPrefix" label="strip" variant="subtle" color="warning" size="sm" />
                    <UBadge v-if="!p.enabled" label="disabled" variant="subtle" color="error" size="sm" />
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <UIcon name="i-lucide-arrow-right" class="size-3" />
                    <span class="truncate font-mono">{{ p.target }}</span>
                    <span v-if="p.upstreamHost" class="truncate">· host: {{ p.upstreamHost }}</span>
                  </div>
                  <p v-if="p.note" class="mt-1 truncate text-xs text-zinc-400">{{ p.note }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <UButton icon="i-lucide-chart-line" variant="ghost" color="neutral" size="xs" label="Logs" @click="viewPairLogs(p)" />
                  <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" aria-label="Edit pair" @click="edit(p)" />
                  <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" aria-label="Delete pair" @click="remove(p)" />
                </div>
              </li>
            </ul>
          </UCard>
          <div v-else class="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <UIcon name="i-lucide-route" class="mx-auto size-8 text-zinc-300" />
            <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No pairs yet</p>
            <p class="mt-1 text-xs text-zinc-500">Create a pair to start forwarding requests</p>
            <UButton class="mt-4" icon="i-lucide-plus" label="Create your first pair" @click="openEditor()" />
          </div>
        </div>

        <!-- ============ SETTINGS ============ -->
        <div v-else-if="tab === 'settings'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Settings</h2>
            <p class="text-sm text-zinc-500">Authentication and logging configuration</p>
          </div>

          <UCard :ui="{ root: 'shadow-sm' }">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-scroll-text" class="size-4 text-zinc-400" />
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Access log</h3>
              </div>
            </template>
            <UForm :state="settingsForm" class="space-y-5" @submit="saveSettings">
              <UFormField label="Retention (days)" name="logRetentionDays" help="Requests older than this are deleted. 0 = keep forever">
                <UInputNumber v-model="settingsForm.logRetentionDays" :min="0" :max="3650" class="w-full max-w-48" />
              </UFormField>
              <USeparator />
              <div class="-ml-0.5 flex items-center gap-2">
                <UIcon name="i-lucide-key-round" class="size-4 text-zinc-400" />
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Authentication</h3>
              </div>
              <UFormField label="OIDC issuer URL" name="oidcIssuer" help="e.g. https://login.microsoftonline.com/<tenant>/v2.0 — empty disables OIDC">
                <UInput v-model="settingsForm.oidcIssuer" placeholder="https://issuer.example.com" icon="i-lucide-globe" class="w-full" />
              </UFormField>
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField label="Client ID" name="oidcClientId">
                  <UInput v-model="settingsForm.oidcClientId" icon="i-lucide-fingerprint" class="w-full" />
                </UFormField>
                <UFormField label="Client secret" name="oidcClientSecret" :help="settingsSecretSet ? 'A secret is stored — leave blank to keep' : 'No secret stored'">
                  <UInput v-model="settingsForm.oidcClientSecret" type="password" icon="i-lucide-key-round" class="w-full" placeholder="••••••••" />
                </UFormField>
              </div>
              <UAlert v-if="settingsEnvOidc" icon="i-lucide-info" color="info" variant="subtle" title="OIDC is also configured via environment variables" description="Settings values take precedence." />
              <USwitch v-model="settingsForm.disablePasswordLogin" label="Disable email + password login" :disabled="!oidcReady" :help="oidcReady ? 'Users will sign in via OIDC only' : 'Configure OIDC above first'" />
              <div class="flex justify-end">
                <UButton type="submit" icon="i-lucide-save" :loading="busy" label="Save settings" />
              </div>
            </UForm>
          </UCard>
        </div>

        <!-- ============ USERS ============ -->
        <div v-else-if="tab === 'users'" class="space-y-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Users</h2>
              <p class="text-sm text-zinc-500">Who can manage this bridge</p>
            </div>
            <UButton icon="i-lucide-user-plus" label="Add user" @click="showAddUser = !showAddUser" />
          </div>

          <UCard v-if="showAddUser" :ui="{ root: 'shadow-sm' }">
            <UForm :state="newUser" :validate="validateNewUser" class="grid gap-5 sm:grid-cols-2" @submit="addUser">
              <UFormField label="Email" name="email">
                <UInput v-model="newUser.email" type="email" icon="i-lucide-mail" class="w-full" />
              </UFormField>
              <UFormField label="Name" name="name">
                <UInput v-model="newUser.name" icon="i-lucide-user" class="w-full" />
              </UFormField>
              <UFormField label="Password" name="password" help="Minimum 8 characters">
                <UInput v-model="newUser.password" type="password" icon="i-lucide-lock" class="w-full" />
              </UFormField>
              <div class="flex items-end justify-end gap-2">
                <UButton variant="ghost" color="neutral" label="Cancel" @click="showAddUser = false" />
                <UButton type="submit" icon="i-lucide-user-plus" :loading="busy" label="Create user" />
              </div>
            </UForm>
          </UCard>

          <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              <li v-for="u in users" :key="u.id" class="flex items-center gap-4 px-5 py-4">
                <UAvatar :name="u.name || u.email" size="md" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-zinc-900 dark:text-white">{{ u.name }}</span>
                    <UBadge v-if="u.id === session.user.id" label="you" variant="subtle" color="primary" size="sm" />
                  </div>
                  <div class="truncate text-xs text-zinc-500">{{ u.email }}</div>
                </div>
                <div class="flex shrink-0 items-center gap-3 text-xs text-zinc-400">
                  <span v-if="u.hasPassword" class="flex items-center gap-1" title="Has a password login"><UIcon name="i-lucide-lock" class="size-3" />password</span>
                  <span v-if="u.oidcLinked" class="flex items-center gap-1" title="Linked to OIDC"><UIcon name="i-lucide-key-round" class="size-3" />oidc</span>
                  <span class="flex items-center gap-1" title="Active sessions"><UIcon name="i-lucide-monitor-smartphone" class="size-3" />{{ u.sessionCount }}</span>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <UButton icon="i-lucide-key-round" variant="ghost" color="neutral" size="xs" label="Reset password" @click="resetPassword(u)" />
                  <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" aria-label="Delete user" :disabled="u.id === session.user.id" @click="removeUser(u)" />
                </div>
              </li>
            </ul>
          </UCard>
        </div>

        <!-- ============ LOGS ============ -->
        <div v-else-if="tab === 'logs'" class="space-y-6">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Access log</h2>
              <p class="text-sm text-zinc-500">
                {{ logFilter ? `Filtered by pair ${logFilter.path}` : 'All forwarded traffic' }}
              </p>
            </div>
            <UButton v-if="logFilter" variant="soft" color="neutral" icon="i-lucide-x" label="Clear filter" @click="logFilter = null; loadLogs()" />
            <UButton v-else icon="i-lucide-refresh-cw" variant="ghost" color="neutral" label="Refresh" :loading="logsBusy" @click="loadLogs()" />
          </div>

          <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
            <div v-if="logs.length" class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                    <th class="px-5 py-3 font-medium">Time</th>
                    <th class="px-3 py-3 font-medium">Method</th>
                    <th class="px-3 py-3 font-medium">Path</th>
                    <th class="px-3 py-3 font-medium">Pair</th>
                    <th class="px-3 py-3 font-medium">Status</th>
                    <th class="px-3 py-3 font-medium">Took</th>
                    <th class="px-5 py-3 font-medium">Client</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100 font-mono text-xs dark:divide-zinc-800/60">
                  <tr v-for="e in logs" :key="e.id" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    <td class="whitespace-nowrap px-5 py-2.5 text-zinc-500">{{ fmtTime(e.ts) }}</td>
                    <td class="px-3 py-2.5 font-semibold text-zinc-600 dark:text-zinc-300">{{ e.method }}</td>
                    <td class="max-w-72 truncate px-3 py-2.5 text-zinc-800 dark:text-zinc-200">{{ e.path }}</td>
                    <td class="px-3 py-2.5"><span v-if="e.pairPath" class="rounded bg-primary/5 px-1.5 py-0.5 text-primary">{{ e.pairPath }}</span></td>
                    <td class="px-3 py-2.5">
                      <span class="rounded px-1.5 py-0.5 font-semibold" :class="statusClass(e.status)">{{ e.status }}</span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-2.5 text-zinc-500">{{ e.durationMs }}ms</td>
                    <td class="whitespace-nowrap px-5 py-2.5 text-zinc-400">{{ e.clientIp || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="p-10 text-center">
              <UIcon name="i-lucide-scroll-text" class="mx-auto size-8 text-zinc-300" />
              <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No traffic logged</p>
              <p class="mt-1 text-xs text-zinc-500">Requests forwarded by pairs appear here</p>
            </div>
            <div v-if="logs.length >= logPageSize" class="flex justify-center border-t border-zinc-100 py-3 dark:border-zinc-800/60">
              <UButton variant="soft" color="neutral" size="sm" label="Load more" :loading="logsBusy" @click="loadLogs(true)" />
            </div>
          </UCard>
        </div>
      </main>
    </div>

    <!-- password reset modal -->
    <UModal v-model:open="pwModalOpen" title="Reset password" description="Set a new password for this user">
      <template #body>
        <UForm :state="pwModal" class="space-y-4" @submit="submitPasswordReset">
          <UFormField label="New password" name="password" help="Minimum 8 characters">
            <UInput v-model="pwModal.password" type="password" icon="i-lucide-lock" class="w-full" required />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" label="Cancel" @click="pwModalOpen = false" />
            <UButton type="submit" :loading="busy" label="Set password" />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- delete confirm modal -->
    <UModal v-model:open="deleteModalOpen" title="Delete pair" :description="deleteModal.what">
      <template #body>
        <p class="text-sm text-zinc-500">This action cannot be undone.</p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="deleteModalOpen = false" />
          <UButton color="error" icon="i-lucide-trash-2" label="Delete" @click="confirmDelete" />
        </div>
      </template>
    </UModal>

    <!-- toasts -->
    <UNotifications />
  </div>
</template>

<script setup lang="ts">
import type { PairRow, PairsResponse } from '../../shared/types'
import { pairSubmitSchema } from '~/utils/pair-form'

interface SessionUser { id: string, name?: string | null, email: string }
interface SessionPayload { user: SessionUser, session: { expiresAt: string } }
interface AuthConfig { passwordEnabled: boolean, oidcEnabled: boolean }
interface AdminUser { id: string, name: string, email: string, emailVerified: boolean, createdAt: string, sessionCount: number, hasPassword: boolean, oidcLinked: boolean }
interface LogRow { id: number, ts: string, pairId: number | null, pairPath: string | null, method: string, path: string, status: number, durationMs: number, clientIp: string | null, userAgent: string | null }

const toast = useToast()

// ---------- state ----------
const loginState = reactive({ email: '', password: '' })
const loginError = ref('')
const session = ref<SessionPayload | null>(null)
const pairs = ref<PairRow[]>([])
const busy = ref(false)
const editing = ref('')
const authConfig = ref<AuthConfig | null>(null)

const tab = ref<'pairs' | 'settings' | 'users' | 'logs'>('pairs')
const tabs = [
  { label: 'Pairs', icon: 'i-lucide-route', value: 'pairs' as const },
  { label: 'Settings', icon: 'i-lucide-settings', value: 'settings' as const },
  { label: 'Users', icon: 'i-lucide-users', value: 'users' as const },
  { label: 'Logs', icon: 'i-lucide-scroll-text', value: 'logs' as const },
]

const userMenuItems = computed(() => [[
  { label: session.value?.user.email, icon: 'i-lucide-user', disabled: true, class: 'opacity-60' },
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout },
]])

const activePairCount = computed(() => pairs.value.filter(p => p.enabled).length)

// ---------- pair form ----------
const emptyForm = () => ({ path: '', target: '', upstreamHost: undefined as string | undefined, note: undefined as string | undefined, stripPrefix: false, enabled: true })
const form = reactive(emptyForm())

const isWildcard = computed(() => form.path.trim().endsWith('/*') || form.path.trim() === '/')
const pathHelp = computed(() => isWildcard.value ? 'Wildcard — matches this path and everything under it' : 'Exact match — this path only. Add /* for a subtree')

function openEditor() {
  editing.value = 'new'
}

function validatePair(state: typeof form): Array<{ name: string, message: string }> {
  const result = pairSubmitSchema.safeParse(state)
  if (result.success) return []
  return result.error.issues
    .filter(i => i.path.length > 0)
    .map(i => ({ name: String(i.path[0]), message: i.message }))
}

// ---------- users ----------
const users = ref<AdminUser[]>([])
const showAddUser = ref(false)
const newUser = reactive({ email: '', name: '', password: '' })

function validateNewUser(state: typeof newUser): Array<{ name: string, message: string }> {
  const errors: Array<{ name: string, message: string }> = []
  if (!/^\S+@\S+\.\S+$/.test(state.email)) errors.push({ name: 'email', message: 'Enter a valid email' })
  if (state.name.trim().length === 0) errors.push({ name: 'name', message: 'Name is required' })
  if (state.password.length < 8) errors.push({ name: 'password', message: 'At least 8 characters' })
  return errors
}

const pwModalOpen = ref(false)
const pwModal = reactive({ userId: '', email: '', password: '' })

function resetPassword(u: AdminUser) {
  pwModal.userId = u.id
  pwModal.email = u.email
  pwModal.password = ''
  pwModalOpen.value = true
}

// ---------- delete confirm ----------
const deleteModalOpen = ref(false)
const deleteModal = reactive({ what: '', kind: '' as 'pair' | 'user', id: '' })

function remove(p: PairRow) {
  deleteModal.what = `${p.path} → ${p.target}`
  deleteModal.kind = 'pair'
  deleteModal.id = p.path
  deleteModalOpen.value = true
}

function removeUser(u: AdminUser) {
  deleteModal.what = `user ${u.email} and all their sessions`
  deleteModal.kind = 'user'
  deleteModal.id = u.id
  deleteModalOpen.value = true
}

// ---------- logs ----------
const logs = ref<LogRow[]>([])
const logsBusy = ref(false)
const logPageSize = 50
const logFilter = ref<{ id: number, path: string } | null>(null)

function viewPairLogs(p: PairRow) {
  logFilter.value = { id: p.id, path: p.path }
  tab.value = 'logs'
  loadLogs()
}

function statusClass(status: number): string {
  if (status >= 500) return 'bg-red-500/10 text-red-600'
  if (status >= 400) return 'bg-amber-500/10 text-amber-600'
  return 'bg-emerald-500/10 text-emerald-600'
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------- settings ----------
const settingsForm = reactive({ logRetentionDays: 30, oidcIssuer: '', oidcClientId: '', oidcClientSecret: '', disablePasswordLogin: false })
const settingsSecretSet = ref(false)
const settingsEnvOidc = ref(false)
const oidcReady = computed(() => settingsForm.oidcIssuer.trim().length > 0 && settingsForm.oidcClientId.trim().length > 0 && (settingsForm.oidcClientSecret.length > 0 || settingsSecretSet.value))

// ---------- lifecycle ----------
onMounted(async () => {
  try {
    authConfig.value = await $fetch<AuthConfig>('/api/auth-config')
  }
  catch {
    authConfig.value = { passwordEnabled: true, oidcEnabled: false }
  }
  try {
    const s = await $fetch<SessionPayload | null>('/_auth/get-session')
    session.value = s?.user ? s : null
    if (session.value) {
      await load()
      loadUsers().catch(() => {})
      loadSettings().catch(() => {})
    }
  }
  catch { /* not signed in */ }
})

watch(isWildcard, (w) => {
  if (!w && form.stripPrefix) form.stripPrefix = false
})

// ---------- actions ----------
async function login() {
  busy.value = true
  loginError.value = ''
  try {
    const res = await $fetch<SessionPayload>('/_auth/sign-in/email', {
      method: 'POST',
      body: { email: loginState.email, password: loginState.password },
    })
    session.value = res
    await load()
    loadUsers().catch(() => {})
    loadSettings().catch(() => {})
  }
  catch {
    loginError.value = 'Invalid email or password'
  }
  busy.value = false
}

async function oidcLogin() {
  try {
    const res = await $fetch<{ url: string }>('/_auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'oidc', callbackURL: '/_admin' },
    })
    if (res.url) window.location.href = res.url
  }
  catch {
    toast.add({ title: 'SSO unavailable', description: 'OIDC provider not reachable', color: 'error' })
  }
}

async function logout() {
  await $fetch('/_auth/sign-out', { method: 'POST' }).catch(() => {})
  session.value = null
  pairs.value = []
}

async function load() {
  const data = await $fetch<PairsResponse>('/api/pairs')
  pairs.value = data.pairs
}

function hostOf(target: string) {
  try { return new URL(target).hostname }
  catch { return '' }
}

function edit(p: PairRow) {
  editing.value = p.path
  Object.assign(form, JSON.parse(JSON.stringify(p)))
}

function reset() {
  editing.value = ''
  Object.assign(form, emptyForm())
}

async function save() {
  busy.value = true
  try {
    const parsed = pairSubmitSchema.safeParse({ ...form })
    if (!parsed.success) {
      toast.add({ title: 'Check the form', description: parsed.error.issues[0]?.message, color: 'error' })
      busy.value = false
      return
    }
    const data = await $fetch<PairsResponse>('/api/pairs', {
      method: 'PUT',
      body: parsed.data,
    })
    pairs.value = data.pairs
    toast.add({ title: editing.value && editing.value !== 'new' ? 'Pair updated' : 'Pair added', color: 'success' })
    reset()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function confirmDelete() {
  try {
    if (deleteModal.kind === 'pair') {
      const data = await $fetch<PairsResponse>(`/api/pairs/${encodeURIComponent(deleteModal.id.slice(1))}`, { method: 'DELETE' })
      pairs.value = data.pairs
      if (editing.value === deleteModal.id) reset()
      toast.add({ title: 'Pair deleted', color: 'success' })
    }
    else {
      await $fetch(`/api/users/${encodeURIComponent(deleteModal.id)}`, { method: 'DELETE' })
      await loadUsers()
      toast.add({ title: 'User deleted', color: 'success' })
    }
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  deleteModalOpen.value = false
}

async function loadUsers() {
  const data = await $fetch<{ users: AdminUser[] }>('/api/users')
  users.value = data.users
}

async function addUser() {
  busy.value = true
  try {
    await $fetch('/api/users', { method: 'POST', body: { ...newUser } })
    newUser.email = ''
    newUser.name = ''
    newUser.password = ''
    showAddUser.value = false
    await loadUsers()
    toast.add({ title: 'User created', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function submitPasswordReset() {
  if (pwModal.password.length < 8) {
    toast.add({ title: 'Too short', description: 'Password must be at least 8 characters', color: 'error' })
    return
  }
  busy.value = true
  try {
    await $fetch(`/api/users/${encodeURIComponent(pwModal.userId)}/password`, { method: 'PUT', body: { password: pwModal.password } })
    pwModalOpen.value = false
    toast.add({ title: `Password updated for ${pwModal.email}`, color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Reset failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function loadLogs(append = false) {
  logsBusy.value = true
  try {
    const beforeId = append && logs.value.length ? logs.value[logs.value.length - 1]?.id : undefined
    const data = await $fetch<{ entries: LogRow[] }>('/api/logs', {
      query: {
        limit: logPageSize,
        ...(logFilter.value ? { pairId: logFilter.value.id } : {}),
        ...(beforeId !== undefined ? { beforeId } : {}),
      },
    })
    logs.value = append ? [...logs.value, ...data.entries] : data.entries
  }
  catch { /* ignore */ }
  logsBusy.value = false
}

watch(tab, (t) => {
  if (t === 'logs' && logs.value.length === 0) loadLogs().catch(() => {})
})

async function loadSettings() {
  const s = await $fetch<{ oidcIssuer: string, oidcClientId: string, oidcClientSecretSet: boolean, disablePasswordLogin: boolean, logRetentionDays: number, envOidc: boolean }>('/api/settings')
  settingsForm.oidcIssuer = s.oidcIssuer
  settingsForm.oidcClientId = s.oidcClientId
  settingsForm.oidcClientSecret = ''
  settingsSecretSet.value = s.oidcClientSecretSet
  settingsForm.disablePasswordLogin = s.disablePasswordLogin
  settingsForm.logRetentionDays = s.logRetentionDays
  settingsEnvOidc.value = s.envOidc
}

async function saveSettings() {
  busy.value = true
  try {
    const body: Record<string, unknown> = {
      oidcIssuer: settingsForm.oidcIssuer.trim(),
      oidcClientId: settingsForm.oidcClientId.trim(),
      disablePasswordLogin: settingsForm.disablePasswordLogin,
      logRetentionDays: settingsForm.logRetentionDays,
    }
    if (settingsForm.oidcClientSecret.trim() !== '') body.oidcClientSecret = settingsForm.oidcClientSecret.trim()
    await $fetch('/api/settings', { method: 'PUT', body })
    toast.add({ title: 'Settings saved', color: 'success' })
    await loadSettings()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}
</script>
