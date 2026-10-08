<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Settings</h2>
      <p class="text-sm text-zinc-500">Authentication and logging configuration</p>
    </div>

    <!-- ============ ACCESS LOG ============ -->
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
        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="busy" label="Save settings" />
        </div>
      </UForm>
    </UCard>

    <!-- ============ AUTHENTICATION ============ -->
    <UCard :ui="{ root: 'shadow-sm' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key-round" class="size-4 text-zinc-400" />
          <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Authentication</h3>
        </div>
      </template>
      <div class="space-y-5">
        <div>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">OIDC providers</h4>
            <UButton v-if="can('settings', 'update')" icon="i-lucide-plus" size="sm" label="Add provider" @click="openOidcEditor()" />
          </div>
          <template v-if="oidcProviders.length">
            <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
              <UTable :data="oidcProviders" :columns="providerColumns">
                <template #provider-cell="{ row }">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ row.original.label }}</span>
                      <UBadge v-if="!row.original.secretSet" variant="subtle" color="warning" size="sm">no secret</UBadge>
                    </div>
                    <div class="mt-0.5 truncate text-xs font-mono text-zinc-500">{{ row.original.issuer }}</div>
                  </div>
                </template>
                <template #callback-cell="{ row }">
                  <span class="block max-w-72 truncate font-mono text-xs text-zinc-500" :title="`${publicOrigin}/auth/callback/${row.original.id}`">{{ publicOrigin }}/auth/callback/{{ row.original.id }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex justify-end gap-2">
                    <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit provider" :disabled="!can('settings', 'update')" @click="openOidcEditor(row.original)" />
                    <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Remove provider" :disabled="!can('settings', 'update')" @click="removeOidcProvider(row.original)" />
                  </div>
                </template>
              </UTable>
            </UCard>
            <p class="mt-2 text-xs text-zinc-400">Register each callback URL above with its identity provider.</p>
          </template>
          <div v-else class="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <UIcon name="i-lucide-key-round" class="mx-auto size-7 text-zinc-300" />
            <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No OIDC providers</p>
            <p class="mt-1 text-xs text-zinc-500">Add one to enable SSO login buttons</p>
            <UButton v-if="can('settings', 'update')" class="mt-4" size="sm" icon="i-lucide-plus" label="Add provider" @click="openOidcEditor()" />
          </div>
        </div>

        <USeparator />

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
        <p v-if="oidcProviders.length && !oidcReady" class="text-xs text-amber-600 dark:text-amber-500">
          Enabled once at least one provider has its secret set.
        </p>
      </div>
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
import type { TableColumn } from '@nuxt/ui'

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

const providerColumns: TableColumn<OidcProviderRow>[] = [
  { id: 'provider', header: 'Provider' },
  { id: 'callback', header: 'Callback URL', meta: { class: { td: 'w-full' } } },
  { id: 'actions', header: '' },
]

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
