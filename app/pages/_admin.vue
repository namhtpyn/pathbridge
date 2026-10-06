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
    if (session.value) await load()
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

function oidcLogin() {
  window.location.href = '/_auth/oauth2/oidc'
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
