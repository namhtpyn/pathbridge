<template>
  <UModal :open="open" title="Profile" description="Your account settings" @update:open="v => emit('update:open', v)">
    <template #body>
      <div class="space-y-6">
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Account</h3>
          <UFormField label="Name" size="sm">
            <UInput v-model="profile.name" icon="i-lucide-user" placeholder="Your name" class="w-full" />
          </UFormField>
          <UFormField label="Email" size="sm">
            <UInput v-model="profile.email" type="email" icon="i-lucide-mail" placeholder="you@example.com" class="w-full" />
          </UFormField>
          <UButton :loading="busy" label="Save changes" icon="i-lucide-check" size="sm" class="mt-1" @click="saveProfile" />
        </div>
        <USeparator />
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Password</h3>
          <UFormField label="Current password" size="sm">
            <UInput v-model="pwForm.current" type="password" icon="i-lucide-lock" class="w-full" />
          </UFormField>
          <UFormField label="New password" size="sm">
            <UInput v-model="pwForm.next" type="password" icon="i-lucide-lock" placeholder="min 8 characters" class="w-full" />
          </UFormField>
          <UFormField label="Confirm new password" size="sm">
            <UInput v-model="pwForm.confirm" type="password" icon="i-lucide-lock" class="w-full" />
          </UFormField>
          <UButton :loading="pwBusy" color="neutral" label="Change password" icon="i-lucide-key-round" size="sm" class="mt-1" @click="changePassword" />
        </div>
        <USeparator />
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">API keys</h3>
            <UButton icon="i-lucide-plus" size="sm" label="Create key" @click="openKeyEditor" />
          </div>
          <p class="text-xs text-zinc-500">Keys act as you but can be scoped to fewer permissions — never more. Shown once at creation.</p>
          <p v-if="apiKeys.length === 0" class="text-sm text-zinc-400">No keys yet.</p>
          <div v-else class="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800/60 dark:border-zinc-800">
            <div v-for="k in apiKeys" :key="k.id" class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ k.name }}</span>
                  <UBadge variant="subtle" color="neutral" size="sm" class="font-mono">{{ k.start }}…</UBadge>
                  <UBadge v-if="k.expiresAt" variant="subtle" color="warning" size="sm">expires {{ new Date(k.expiresAt).toLocaleDateString() }}</UBadge>
                  <UBadge v-else variant="subtle" color="neutral" size="sm">no expiry</UBadge>
                </div>
                <div class="mt-0.5 text-xs text-zinc-400">
                  {{ k.lastRequest ? `last used ${new Date(k.lastRequest).toLocaleString()}` : 'never used' }} · {{ k.requestCount }} requests
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Revoke key" @click="revokeKey(k)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <!-- API key editor modal -->
  <KeyEditorModal v-model:open="keyEditorOpen" @created="onKeyCreated" />
  <!-- key created: show once -->
  <UModal :open="!!createdKeyValue" title="API key created" description="Copy it now — it will not be shown again" @update:open="v => !v && (createdKeyValue = '')">
    <template #body>
      <div class="space-y-3">
        <UInput :model-value="createdKeyValue" readonly class="w-full font-mono" />
        <div class="flex justify-end gap-2">
          <UButton icon="i-lucide-copy" color="neutral" label="Copy" @click="copyCreatedKey" />
          <UButton label="Done" @click="createdKeyValue = ''" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { session, perms } = await useAdminSession()
const toast = useToast()
const busy = ref(false)

const profile = reactive({ name: '', email: '' })
const pwForm = reactive({ current: '', next: '', confirm: '' })
const pwBusy = ref(false)

interface ApiKeyRow { id: string, name: string, start: string, enabled: boolean, expiresAt: string | null, lastRequest: string | null, requestCount: number, permissions: Record<string, string[]> | null }
const apiKeys = ref<ApiKeyRow[]>([])
const keyEditorOpen = ref(false)
const createdKeyValue = ref('')

watch(() => props.open, (o) => {
  if (o) {
    profile.name = session.value?.user.name ?? ''
    profile.email = session.value?.user.email ?? ''
    pwForm.current = ''
    pwForm.next = ''
    pwForm.confirm = ''
    loadApiKeys()
  }
})

async function loadApiKeys() {
  try {
    const r = await $fetch<{ keys: ApiKeyRow[] }>('/api/keys')
    apiKeys.value = r.keys
  }
  catch { apiKeys.value = [] }
}

function openKeyEditor() { keyEditorOpen.value = true }
function onKeyCreated(key: string) {
  createdKeyValue.value = key
  loadApiKeys()
}

async function saveProfile() {
  busy.value = true
  try {
    const body: Record<string, string> = {}
    if (profile.name.trim() && profile.name !== session.value?.user.name) body.name = profile.name.trim()
    if (profile.email.trim() && profile.email !== session.value?.user.email) body.email = profile.email.trim()
    if (Object.keys(body).length === 0) {
      busy.value = false
      toast.add({ title: 'No changes to save', color: 'neutral' })
      return
    }
    await $fetch('/auth/update-user', { method: 'POST', body })
    session.value = { ...session.value!, user: { ...session.value!.user, ...body } }
    toast.add({ title: 'Profile updated', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string, message?: string }, message?: string }
    toast.add({ title: 'Update failed', description: err.data?.statusMessage || err.data?.message || err.message, color: 'error' })
  }
  busy.value = false
}

async function changePassword() {
  if (pwForm.next !== pwForm.confirm) {
    toast.add({ title: 'Passwords do not match', color: 'error' })
    return
  }
  if (pwForm.next.length < 8) {
    toast.add({ title: 'Password too short', description: 'Minimum 8 characters', color: 'error' })
    return
  }
  pwBusy.value = true
  try {
    await $fetch('/auth/change-password', { method: 'POST', body: { currentPassword: pwForm.current, newPassword: pwForm.next, revokeOtherSessions: true } })
    pwForm.current = ''
    pwForm.next = ''
    pwForm.confirm = ''
    toast.add({ title: 'Password changed', description: 'Other sessions were signed out', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string, message?: string }, message?: string }
    toast.add({ title: 'Change failed', description: err.data?.statusMessage || err.data?.message || err.message, color: 'error' })
  }
  pwBusy.value = false
}

async function revokeKey(k: ApiKeyRow) {
  try {
    await $fetch(`/api/keys/${encodeURIComponent(k.id)}`, { method: 'DELETE' })
    toast.add({ title: 'Key revoked', color: 'success' })
    await loadApiKeys()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Revoke failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

function copyCreatedKey() {
  navigator.clipboard?.writeText(createdKeyValue.value)
  toast.add({ title: 'Copied', color: 'success' })
}
</script>
