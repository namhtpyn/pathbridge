<template>
  <div class="space-y-6">
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
        <UFormField name="logRetentionDays">
          <template #label>Retention (days)</template>
          <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
              <template #default>
                <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
              </template>
              <template #content>
                <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                  <p class="text-xs font-semibold text-white">Retention</p>
                  <p class="text-xs text-zinc-200">Access-log entries older than this many days are deleted automatically (sweeper runs every 6 hours).</p>
                  <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. 30 (default) · 0 = keep forever</p>
                </div>
              </template>
          </UPopover></template>
          <UInputNumber v-model="settingsForm.logRetentionDays" :min="0" :max="3650" class="w-full max-w-48" />
        </UFormField>
        <USeparator />
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-key-round" class="size-4 text-zinc-400" />
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">OIDC providers</h3>
          </div>
          <UButton v-if="can('settings', 'update')" icon="i-lucide-plus" size="sm" label="Add provider" @click="openOidcEditor()" />
        </div>
        <p v-if="oidcProviders.length === 0" class="text-sm text-zinc-500">No OIDC providers configured. Add one to enable SSO login buttons.</p>
        <div v-else class="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800/60 dark:border-zinc-800">
          <div v-for="prov in oidcProviders" :key="prov.id" class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ prov.label }}</span>
                <UBadge v-if="!prov.secretSet" variant="subtle" color="warning" size="sm">no secret</UBadge>
              </div>
              <div class="mt-0.5 truncate text-xs font-mono text-zinc-500">{{ publicOrigin }}/auth/callback/{{ prov.id }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit provider" :disabled="!can('settings', 'update')" @click="openOidcEditor(prov)" />
              <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Remove provider" :disabled="!can('settings', 'update')" @click="removeOidcProvider(prov)" />
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <USwitch v-model="settingsForm.disablePasswordLogin" :disabled="!oidcReady" label="Disable email + password login" />
          <UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
            <template #default>
              <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
            </template>
            <template #content>
              <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                <p class="text-xs font-semibold text-white">Disable password login</p>
                <p class="text-xs text-zinc-200">Turns off the email + password sign-in form entirely; everyone signs in via OIDC. Requires OIDC to be fully configured first — this prevents locking yourself out.</p>
              </div>
            </template>
          </UPopover>
        </div>
        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="busy" label="Save settings" />
        </div>
      </UForm>
    </UCard>

    <!-- OIDC provider editor modal -->
    <UModal :open="oidcEditorOpen" :title="oidcEditingId ? `Edit ${oidcEditingId}` : 'Add OIDC provider'" description="Register the redirect URL shown after saving in your OIDC provider" @update:open="v => oidcEditorOpen = v">
      <template #body>
        <UForm :state="oidcForm" class="space-y-4" @submit="saveOidcProvider">
          <UFormField name="oidcLabel" label="Name" required help="Shown on the login button">
            <UInput v-model="oidcForm.label" icon="i-lucide-tag" class="w-full" placeholder="Azure AD" />
          </UFormField>
          <UFormField name="oidcIssuer2" label="Issuer URL" required>
            <UInput v-model="oidcForm.issuer" icon="i-lucide-globe" class="w-full" placeholder="https://issuer.example.com" />
          </UFormField>
          <UFormField name="oidcClientId2" label="Client ID" required>
            <UInput v-model="oidcForm.clientId" class="w-full" />
          </UFormField>
          <UFormField name="oidcSecret2" :label="oidcEditingId ? 'Client secret (blank = keep stored)' : 'Client secret'" :required="!oidcEditingId">
            <UInput v-model="oidcForm.clientSecret" type="password" icon="i-lucide-key-round" class="w-full" placeholder="••••••••" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="oidcEditorOpen = false" />
            <UButton type="submit" icon="i-lucide-plus" :loading="busy" :label="oidcEditingId ? 'Save changes' : 'Add provider'" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const toast = useToast()
const busy = ref(false)

const settingsForm = reactive({ logRetentionDays: 30, disablePasswordLogin: false })
interface OidcProviderRow { id: string, label: string, issuer: string, clientId: string, secretSet: boolean }
const oidcProviders = ref<OidcProviderRow[]>([])
const oidcEditorOpen = ref(false)
const oidcEditingId = ref<string | null>(null)
const oidcForm = reactive({ id: '', label: '', issuer: '', clientId: '', clientSecret: '' })

const publicOrigin = computed(() => {
  if (import.meta.server) {
    try { return useRequestURL().origin }
    catch { return '' }
  }
  return window.location.origin
})
const oidcReady = computed(() => oidcProviders.value.some(p => p.secretSet))

async function loadSettings() {
  const s = await $fetch<{ disablePasswordLogin: boolean, logRetentionDays: number }>('/api/settings')
  settingsForm.disablePasswordLogin = s.disablePasswordLogin
  settingsForm.logRetentionDays = s.logRetentionDays
  await loadOidcProviders()
}

async function loadOidcProviders() {
  const r = await $fetch<{ providers: OidcProviderRow[] }>('/api/oidc')
  oidcProviders.value = r.providers
}

onMounted(() => { loadSettings().catch(() => {}) })

function openOidcEditor(prov?: OidcProviderRow) {
  oidcEditingId.value = prov?.id ?? null
  oidcForm.id = prov?.id ?? ''
  oidcForm.label = prov?.label ?? ''
  oidcForm.issuer = prov?.issuer ?? ''
  oidcForm.clientId = prov?.clientId ?? ''
  oidcForm.clientSecret = ''
  oidcEditorOpen.value = true
}

async function saveOidcProvider() {
  const list = oidcProviders.value
    .filter(p => p.id !== oidcForm.id)
    .map(p => ({ id: p.id, label: p.label, issuer: p.issuer, clientId: p.clientId, clientSecret: '' }))
  list.push({
    id: oidcForm.id.trim().toLowerCase(),
    label: oidcForm.label.trim() || oidcForm.id.trim(),
    issuer: oidcForm.issuer.trim(),
    clientId: oidcForm.clientId.trim(),
    clientSecret: oidcForm.clientSecret,
  })
  try {
    await $fetch('/api/oidc', { method: 'PUT', body: { providers: list } })
    toast.add({ title: oidcEditingId.value ? 'Provider updated' : 'Provider added', color: 'success' })
    oidcEditorOpen.value = false
    await loadOidcProviders()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

async function removeOidcProvider(prov: OidcProviderRow) {
  const list = oidcProviders.value.filter(p => p.id !== prov.id).map(p => ({ id: p.id, label: p.label, issuer: p.issuer, clientId: p.clientId, clientSecret: '' }))
  try {
    await $fetch('/api/oidc', { method: 'PUT', body: { providers: list } })
    toast.add({ title: 'Provider removed', color: 'success' })
    await loadOidcProviders()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Remove failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

async function saveSettings() {
  busy.value = true
  try {
    await $fetch('/api/settings', {
      method: 'PUT',
      body: {
        disablePasswordLogin: settingsForm.disablePasswordLogin,
        logRetentionDays: settingsForm.logRetentionDays,
      },
    })
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
