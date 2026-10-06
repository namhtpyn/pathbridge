<template>
  <UPage>
    <UPageHeader
      title="pathbridge"
      description="forward selected paths to external upstreams"
      :ui="{ root: 'mb-8' }"
    >
      <template #leading>
        <UAvatar icon="i-lucide-arrow-left-right" size="lg" />
      </template>
      <template #headline />
    </UPageHeader>

    <UPageBody>
      <!-- login -->
      <UCard v-if="!session && authConfig?.passwordEnabled !== false" :ui="{ root: 'mx-auto max-w-sm' }">
        <template #header>
          <UPageCard
            title="Sign in"
            description="manage forwarding pairs"
            variant="subtle"
            :ui="{ container: 'p-0' }"
          />
        </template>
        <UForm :state="loginState" class="space-y-4" @submit="login">
          <UFormField label="Email" name="email">
            <UInput v-model="loginState.email" type="email" icon="i-lucide-mail" placeholder="you@example.com" class="w-full" required />
          </UFormField>
          <UFormField label="Password" name="password">
            <UInput v-model="loginState.password" type="password" icon="i-lucide-lock" class="w-full" required />
          </UFormField>
          <UAlert v-if="loginError" icon="i-lucide-shield-alert" color="error" variant="subtle" :title="loginError" />
          <UButton type="submit" block :loading="busy" label="Sign in" trailing-icon="i-lucide-arrow-right" />
          <UButton
            v-if="authConfig?.oidcEnabled"
            block
            variant="outline"
            icon="i-lucide-key-round"
            label="Sign in with SSO"
            @click="oidcLogin"
          />
        </UForm>
      </UCard>

      <UCard v-else-if="!session && authConfig?.oidcEnabled" :ui="{ root: 'mx-auto max-w-sm' }">
        <UButton block icon="i-lucide-key-round" label="Sign in with SSO" @click="oidcLogin" />
      </UCard>

      <!-- main -->
      <template v-else-if="session">
        <UPage as="section">
          <UPageBody >
            <UDashboardNavbar :title="session.user.name || session.user.email">
              <template #right>
                <UButton icon="i-lucide-log-out" variant="ghost" color="neutral" label="Sign out" @click="logout" />
              </template>
            </UDashboardNavbar>

            <UTabs :items="tabItems" class="mb-6" />

            <!-- LOGS -->
            <UCard v-if="tab === 'logs'">
              <template #header>
                <UPageCard title="Access log" variant="subtle" :ui="{ root: 'p-0' }">
                  <template #leading><UIcon name="i-lucide-scroll-text" /></template>
                  <template #trailing>
                    <UButton icon="i-lucide-refresh-cw" variant="ghost" size="xs" :loading="logsBusy" label="Refresh" @click="loadLogs(false)" />
                  </template>
                </UPageCard>
              </template>
              <UTable :data="logTable" :columns="logColumns" :empty-state="{ icon: 'i-lucide-scroll-text', label: 'No traffic yet', helper: 'Requests forwarded by pairs appear here' }">
                <template #ts-cell="{ row }">
                  <span class="font-mono text-xs">{{ new Date(row.original.ts).toLocaleString() }}</span>
                </template>
                <template #method-cell="{ row }">
                  <UBadge :label="row.original.method" variant="subtle" color="neutral" />
                </template>
                <template #path-cell="{ row }">
                  <span class="font-mono text-xs">{{ row.original.path }}</span>
                </template>
                <template #pairPath-cell="{ row }">
                  <UBadge v-if="row.original.pairPath" :label="row.original.pairPath" variant="subtle" color="primary" />
                </template>
                <template #status-cell="{ row }">
                  <UBadge :label="String(row.original.status)" variant="subtle" :color="statusColor(row.original.status)" />
                </template>
                <template #durationMs-cell="{ row }">
                  <span class="font-mono text-xs text-muted">{{ row.original.durationMs }}ms</span>
                </template>
                <template #clientIp-cell="{ row }">
                  <span class="font-mono text-xs text-muted">{{ row.original.clientIp || '—' }}</span>
                </template>
              </UTable>
              <div v-if="logs.length >= logLimit" class="mt-4 flex justify-center">
                <UButton variant="soft" label="Load more" :loading="logsBusy" @click="loadLogs(true)" />
              </div>
            </UCard>

            <!-- SETTINGS -->
            <UCard v-else-if="tab === 'settings'">
              <template #header>
                <UPageCard title="Settings" variant="subtle" :ui="{ root: 'p-0' }">
                  <template #leading><UIcon name="i-lucide-settings" /></template>
                </UPageCard>
              </template>
              <UForm :state="settingsForm" class="space-y-5" @submit="saveSettings">
                <UFormField label="Access log retention (days)" name="logRetentionDays" help="0 = keep forever">
                  <UInputNumber v-model="settingsForm.logRetentionDays" :min="0" :max="3650" class="w-full" />
                </UFormField>

                <USeparator>Authentication</USeparator>

                <UFormField label="OIDC issuer URL" name="oidcIssuer" help="e.g. https://login.microsoftonline.com/<tenant>/v2.0 — empty = OIDC off">
                  <UInput v-model="settingsForm.oidcIssuer" placeholder="https://issuer.example.com" icon="i-lucide-globe" class="w-full" />
                </UFormField>
                <UFormField label="OIDC client ID" name="oidcClientId">
                  <UInput v-model="settingsForm.oidcClientId" icon="i-lucide-fingerprint" class="w-full" />
                </UFormField>
                <UFormField label="OIDC client secret" name="oidcClientSecret" :help="settingsSecretSet ? 'A secret is stored — leave blank to keep it' : 'No secret stored yet'">
                  <UInput v-model="settingsForm.oidcClientSecret" type="password" icon="i-lucide-key-round" class="w-full" placeholder="••••••••" />
                </UFormField>
                <USwitch v-model="settingsForm.disablePasswordLogin" label="Disable email+password login" :disabled="!oidcReady" :help="oidcReady ? 'Requires OIDC fully configured' : 'Configure OIDC above first'" />
                <UButton type="submit" icon="i-lucide-save" :loading="busy" label="Save settings" />
              </UForm>
            </UCard>

            <!-- USERS -->
            <UCard v-else-if="tab === 'users'">
              <template #header>
                <UPageCard title="Users" variant="subtle" :ui="{ root: 'p-0' }">
                  <template #leading><UIcon name="i-lucide-users" /></template>
                  <template #trailing>
                    <UBadge variant="subtle" color="neutral" :label="`${users.length}`" />
                  </template>
                </UPageCard>
              </template>
              <UTable :data="userTable" :columns="userColumns">
                <template #email-cell="{ row }">
                  <span class="font-medium">{{ row.original.email }}</span>
                </template>
                <template #name-cell="{ row }">
                  <span>{{ row.original.name }}</span>
                </template>
                <template #createdAt-cell="{ row }">
                  <span class="text-xs text-muted">{{ new Date(row.original.createdAt).toLocaleDateString() }}</span>
                </template>
                <template #authFlags-cell="{ row }">
                  <div class="flex gap-1">
                    <UBadge v-if="row.original.hasPassword" label="password" variant="subtle" color="neutral" />
                    <UBadge v-if="row.original.oidcLinked" label="oidc" variant="subtle" color="primary" />
                    <UBadge :label="`${row.original.sessionCount} sess.`" variant="subtle" color="neutral" />
                  </div>
                </template>
                <template #userActions-cell="{ row }">
                  <div class="flex justify-end gap-1">
                    <UButton icon="i-lucide-key-round" variant="ghost" color="neutral" size="xs" label="Reset password" @click="resetPassword(row.original)" />
                    <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" :disabled="row.original.id === session?.user.id" @click="removeUser(row.original)" />
                  </div>
                </template>
              </UTable>
              <USeparator>Add a user</USeparator>
              <UForm :state="newUser" class="grid gap-4 sm:grid-cols-2" @submit="addUser">
                <UFormField label="Email" name="email">
                  <UInput v-model="newUser.email" type="email" icon="i-lucide-mail" class="w-full" required />
                </UFormField>
                <UFormField label="Name" name="name">
                  <UInput v-model="newUser.name" icon="i-lucide-user" class="w-full" required />
                </UFormField>
                <UFormField label="Password" name="password" help="min 8 chars">
                  <UInput v-model="newUser.password" type="password" icon="i-lucide-lock" class="w-full" required />
                </UFormField>
                <div class="flex items-end justify-end">
                  <UButton type="submit" icon="i-lucide-user-plus" :loading="busy" label="Create user" />
                </div>
              </UForm>
            </UCard>

            <!-- PAIRS (editor + list) -->
            <template v-else>
            <!-- editor -->
            <UCard>
              <template #header>
                <UPageCard
                  :title="editing ? `Edit ${editing}` : 'New pair'"
                  variant="subtle"
                  :ui="{ container: 'p-0' }"
                >
                  <template #leading>
                    <UIcon :name="editing ? 'i-lucide-pencil' : 'i-lucide-plus'" />
                  </template>
                </UPageCard>
              </template>
              <UForm :state="form" :validate="validatePair" class="space-y-4" @submit="save">
                <UFormField label="Path" name="path" :help="pathHelp">
                  <UInput v-model="form.path" placeholder="/hook or /hook/*" icon="i-lucide-slash" class="w-full" required />
                </UFormField>
                <UFormField label="Target origin" name="target" help="Absolute URL, no path">
                  <UInput v-model="form.target" placeholder="https://api.example.com" icon="i-lucide-globe" class="w-full" required />
                </UFormField>
                <UFormField label="Upstream Host header" name="upstreamHost" help="Optional — defaults to target hostname">
                  <UInput v-model="form.upstreamHost" placeholder="api.example.com" icon="i-lucide-server" class="w-full" />
                </UFormField>
                <UFormField label="Note" name="note" help="What this pair is for">
                  <UInput v-model="form.note" placeholder="webhook from partner X" icon="i-lucide-notebook-pen" class="w-full" />
                </UFormField>
                <div class="flex items-center justify-between gap-3">
                  <USwitch v-model="form.stripPrefix" :label="isWildcard ? 'Strip prefix' : 'Strip prefix (needs /*)'" :disabled="!isWildcard" />
                  <USwitch v-model="form.enabled" label="Enabled" />
                </div>
                <div class="flex justify-end gap-2">
                  <UButton v-if="editing" variant="ghost" color="neutral" label="Cancel" @click="reset" />
                  <UButton type="submit" :loading="busy" :label="editing ? 'Update pair' : 'Add pair'" icon="i-lucide-plus" />
                </div>
              </UForm>
            </UCard>

            <!-- list -->
            <UCard :ui="{ root: 'overflow-hidden' }">
              <template #header>
                <UPageCard
                  title="Pairs"
                  variant="subtle"
                  :ui="{ container: 'p-0' }"
                >
                  <template #leading>
                    <UIcon name="i-lucide-list" />
                  </template>
                  <template #trailing>
                    <UBadge variant="subtle" color="neutral" :label="`${pairs.length}`" />
                  </template>
                </UPageCard>
              </template>
              <UTable :data="tableData" :columns="columns" :empty-state="{ icon: 'i-lucide-database', label: 'No pairs yet', helper: 'Add your first pair above' }">
                <template #path-cell="{ row }">
                  <UBadge :label="row.original.path" variant="subtle" :color="row.original.enabled ? 'primary' : 'neutral'" />
                </template>
                <template #target-cell="{ row }">
                  <UBadge :label="row.original.target" variant="outline" color="neutral" />
                </template>
                <template #host-cell="{ row }">
                  <UBadge :label="row.original.upstreamHost || hostOf(row.original.target)" variant="subtle" color="neutral" />
                </template>
                <template #note-cell="{ row }">
                  <UBadge v-if="row.original.note" :label="row.original.note" variant="subtle" color="neutral" />
                </template>
                <template #flags-cell="{ row }">
                  <UBadge v-if="row.original.stripPrefix" label="strip" variant="subtle" color="warning" />
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex justify-end gap-1">
                    <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="xs" @click="edit(row.original.raw)" />
                    <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="remove(row.original.raw)" />
                  </div>
                </template>
              </UTable>
            </UCard>
            </template>
          </UPageBody>
        </UPage>
      </template>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import type { PairRow, PairsResponse } from '../../shared/types'
import { pairSubmitSchema } from '~/utils/pair-form'

interface SessionUser { id: string, name?: string | null, email: string }
interface SessionPayload { user: SessionUser, session: { expiresAt: string } }
interface AuthConfig { passwordEnabled: boolean, oidcEnabled: boolean }

const toast = useToast()

// ---- tabs ----
const tab = ref<'pairs' | 'settings' | 'users' | 'logs'>('pairs')
const tabItems = [
  { label: 'Pairs', icon: 'i-lucide-list', value: 'pairs' as const },
  { label: 'Settings', icon: 'i-lucide-settings', value: 'settings' as const },
  { label: 'Users', icon: 'i-lucide-users', value: 'users' as const },
  { label: 'Logs', icon: 'i-lucide-scroll-text', value: 'logs' as const },
]

// ---- users ----
interface AdminUser { id: string, name: string, email: string, emailVerified: boolean, createdAt: string, sessionCount: number, hasPassword: boolean, oidcLinked: boolean }
const users = ref<AdminUser[]>([])
const newUser = reactive({ email: '', name: '', password: '' })
const userColumns = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'createdAt', header: 'Created' },
  { accessorKey: 'authFlags', header: 'Auth' },
  { id: 'userActions', header: '' },
]
const userTable = computed(() => users.value)

// ---- logs ----
interface LogRow { id: number, ts: string, pairId: number | null, pairPath: string | null, method: string, path: string, status: number, durationMs: number, clientIp: string | null, userAgent: string | null }
const logs = ref<LogRow[]>([])
const logsBusy = ref(false)
const logLimit = 100
const logColumns = [
  { accessorKey: 'ts', header: 'Time' },
  { accessorKey: 'method', header: 'Method' },
  { accessorKey: 'path', header: 'Path' },
  { accessorKey: 'pairPath', header: 'Pair' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'durationMs', header: 'Took' },
  { accessorKey: 'clientIp', header: 'Client' },
]
const logTable = computed(() => logs.value)

function statusColor(status: number): 'success' | 'warning' | 'error' {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warning'
  return 'success'
}

// ---- settings ----
const settingsForm = reactive({ logRetentionDays: 30, oidcIssuer: '', oidcClientId: '', oidcClientSecret: '', disablePasswordLogin: false })
const settingsSecretSet = ref(false)
const oidcReady = computed(() => settingsForm.oidcIssuer.trim().length > 0 && settingsForm.oidcClientId.trim().length > 0 && (settingsForm.oidcClientSecret.length > 0 || settingsSecretSet.value))

const loginState = reactive({ email: '', password: '' })
const loginError = ref('')
const session = ref<SessionPayload | null>(null)
const pairs = ref<PairRow[]>([])
const busy = ref(false)
const editing = ref('')
const authConfig = ref<AuthConfig | null>(null)

const emptyForm = () => ({ path: '', target: '', upstreamHost: undefined as string | undefined, note: undefined as string | undefined, stripPrefix: false, enabled: true })
const form = reactive(emptyForm())

const isWildcard = computed(() => form.path.trim().endsWith('/*') || form.path.trim() === '/')
const pathHelp = computed(() => isWildcard.value ? 'Wildcard — matches this path and everything under it' : 'Exact match — this path only. Add /* for a subtree')

// Frontend schema TRANSFORMS loose input -> clean payload; UX errors surfaced
// inline. Backend strict schema re-validates the transformed data for security.
function validatePair(state: typeof form): Array<{ name: string, message: string }> {
  const result = pairSubmitSchema.safeParse(state)
  if (result.success) return []
  return result.error.issues
    .filter(i => i.path.length > 0)
    .map(i => ({ name: String(i.path[0]), message: i.message }))
}

const columns = [
  { accessorKey: 'path', header: 'Path' },
  { accessorKey: 'target', header: 'Target' },
  { accessorKey: 'host', header: 'Host header' },
  { accessorKey: 'note', header: 'Note' },
  { accessorKey: 'flags', header: '' },
  { id: 'actions', header: '' },
]

const tableData = computed(() => pairs.value.map(p => ({ ...p, raw: p })))

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
    toast.add({ title: 'Welcome back', color: 'success' })
  }
  catch {
    loginError.value = 'Invalid credentials'
  }
  busy.value = false
}

async function oidcLogin() {
  // better-auth social sign-in returns the provider's authorize URL
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
    await loadUsers()
    toast.add({ title: 'User created', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function removeUser(u: AdminUser) {
  if (!confirm(`Delete ${u.email} and all their sessions?`)) return
  try {
    await $fetch(`/api/users/${encodeURIComponent(u.id)}`, { method: 'DELETE' })
    await loadUsers()
    toast.add({ title: 'User deleted', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

async function resetPassword(u: AdminUser) {
  const pw = prompt(`New password for ${u.email} (min 8 chars)`)
  if (!pw) return
  try {
    await $fetch(`/api/users/${encodeURIComponent(u.id)}/password`, { method: 'PUT', body: { password: pw } })
    toast.add({ title: 'Password updated', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Reset failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

async function loadLogs(append = false) {
  logsBusy.value = true
  try {
    const beforeId = append && logs.value.length ? logs.value[logs.value.length - 1]?.id : undefined
    const data = await $fetch<{ entries: LogRow[] }>('/api/logs', {
      query: { limit: logLimit, ...(beforeId !== undefined ? { beforeId } : {}) },
    })
    logs.value = append ? [...logs.value, ...data.entries] : data.entries
  }
  catch { /* ignore */ }
  logsBusy.value = false
}

async function loadSettings() {
  const s = await $fetch<{ oidcIssuer: string, oidcClientId: string, oidcClientSecretSet: boolean, disablePasswordLogin: boolean, logRetentionDays: number }>('/api/settings')
  settingsForm.oidcIssuer = s.oidcIssuer
  settingsForm.oidcClientId = s.oidcClientId
  settingsForm.oidcClientSecret = ''
  settingsSecretSet.value = s.oidcClientSecretSet
  settingsForm.disablePasswordLogin = s.disablePasswordLogin
  settingsForm.logRetentionDays = s.logRetentionDays
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

watch(isWildcard, (w) => {
  if (!w && form.stripPrefix) form.stripPrefix = false
})
watch(tab, (t) => {
  if (t === 'logs' && logs.value.length === 0) loadLogs().catch(() => {})
})

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
    // transform loose form state -> clean payload; backend re-validates strictly
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
    toast.add({ title: editing.value ? 'Pair updated' : 'Pair added', color: 'success' })
    reset()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function remove(p: PairRow) {
  if (!confirm(`Delete ${p.path}?`)) return
  try {
    const data = await $fetch<PairsResponse>(`/api/pairs/${encodeURIComponent(p.path.slice(1))}`, { method: 'DELETE' })
    pairs.value = data.pairs
    if (editing.value === p.path) reset()
    toast.add({ title: 'Pair deleted', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}
</script>
