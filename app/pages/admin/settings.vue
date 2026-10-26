<template>
  <div class="space-y-6">
    <PageHeader title="Settings" subtitle="Authentication and logging configuration" />

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
          <template #hint>
            <FieldHint title="Retention" example="e.g. 30 (default) · 0 = keep forever">
              Access-log entries older than this many days are deleted automatically (sweeper runs every 6 hours).
            </FieldHint>
          </template>
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
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ row.original.label }}</span>
                    <UBadge v-if="!row.original.secretSet" variant="subtle" color="warning" size="sm">no secret</UBadge>
                  </div>
                </template>
                <template #callback-cell="{ row }">
                  <span class="block font-mono text-xs break-all text-zinc-500">{{ publicOrigin }}/auth/callback/{{ row.original.id }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex justify-end gap-2">
                    <IconButton text="Edit provider" icon="i-lucide-pencil" :disabled="!can('settings', 'update')" @click="openOidcEditor(row.original)" />
                    <IconButton text="Remove provider" icon="i-lucide-trash-2" color="error" :disabled="!can('settings', 'update')" @click="askRemoveOidcProvider(row.original)" />
                  </div>
                </template>
              </UTable>
            </UCard>
            <p class="mt-2 text-xs text-zinc-400">Register each callback URL above with its identity provider.</p>
          </template>
          <EmptyState v-else icon="i-lucide-key-round" title="No OIDC providers" description="Add one to enable SSO login buttons">
            <UButton v-if="can('settings', 'update')" class="mt-4" size="sm" icon="i-lucide-plus" label="Add provider" @click="openOidcEditor()" />
          </EmptyState>
        </div>

        <USeparator />

        <div class="flex items-center gap-1.5">
          <USwitch v-model="settingsForm.disablePasswordLogin" :disabled="!oidcReady" label="Disable email + password login" />
          <FieldHint title="Disable password login">
            Turns off the email + password sign-in form entirely; everyone signs in via OIDC. Requires OIDC to be fully configured first — this prevents locking yourself out.
          </FieldHint>
        </div>
        <p v-if="oidcProviders.length && !oidcReady" class="text-xs text-amber-600 dark:text-amber-500">
          Enabled once at least one provider has its secret set.
        </p>
      </div>
    </UCard>

    <!-- OIDC provider editor modal -->
    <FormModal
      :open="oidcEditorOpen" :title="oidcEditingId ? `Edit ${oidcEditingId}` : 'Add OIDC provider'" description="Register the redirect URL shown after saving in your OIDC provider"
      :form-id="oidcFormId" :submit-label="oidcEditingId ? 'Save changes' : 'Add provider'" submit-icon="i-lucide-check" :busy="busy"
      @update:open="v => oidcEditorOpen = v"
    >
      <UForm :id="oidcFormId" :state="oidcForm" class="space-y-4" @submit="saveOidcProvider">
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
      </UForm>
    </FormModal>

    <!-- provider remove confirm modal -->
    <ConfirmModal v-model:open="removeOidcOpen" title="Remove OIDC provider" :description="removeOidc.what" confirm-label="Remove" confirm-icon="i-lucide-trash-2" :busy="removeOidcBusy" @confirm="confirmRemoveOidcProvider" />
  </div>
</template>

<script setup lang="ts">

useHead({ title: 'Settings' })
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const toast = useToast()
const { $client } = useNuxtApp()
const busy = ref(false)

const settingsForm = reactive({ logRetentionDays: 30, disablePasswordLogin: false })
interface OidcProviderRow { id: string, label: string, issuer: string, clientId: string, secretSet: boolean }
const oidcProviders = ref<OidcProviderRow[]>([])
const oidcEditorOpen = ref(false)
const oidcEditingId = ref<string | null>(null)
const oidcFormId = useId()
const oidcForm = reactive({ id: '', label: '', issuer: '', clientId: '', clientSecret: '' })

// provider removal is destructive (breaks its SSO logins) -> confirm first
const removeOidcOpen = ref(false)
const removeOidcBusy = ref(false)
const removeOidc = reactive({ what: '', id: '' })

function askRemoveOidcProvider(prov: OidcProviderRow) {
  removeOidc.what = `provider ${prov.label} — its SSO logins will stop working`
  removeOidc.id = prov.id
  removeOidcOpen.value = true
}

async function confirmRemoveOidcProvider() {
  removeOidcBusy.value = true
  await removeOidcProviderById(removeOidc.id)
  removeOidcBusy.value = false
  removeOidcOpen.value = false
}

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
  const s = await $client.settings.get()
  settingsForm.disablePasswordLogin = s.disablePasswordLogin
  settingsForm.logRetentionDays = s.logRetentionDays
  await loadOidcProviders()
}

async function loadOidcProviders() {
  const r = await $client.oidc.list()
  oidcProviders.value = r.providers as OidcProviderRow[]
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
  busy.value = true
  const list: Array<{ id: string | undefined, label: string, issuer: string, clientId: string, clientSecret: string }> = oidcProviders.value
    .filter(p => p.id !== oidcForm.id)
    .map(p => ({ id: p.id, label: p.label, issuer: p.issuer, clientId: p.clientId, clientSecret: '' }))
  // empty id = NEW provider -> send undefined so the server autogenerates a uuid
  // (sending id:'' fails zod min(2) and 400s with 'invalid provider payload')
  const trimmedId = oidcForm.id.trim().toLowerCase()
  list.push({
    id: trimmedId || undefined,
    label: oidcForm.label.trim() || oidcForm.id.trim(),
    issuer: oidcForm.issuer.trim(),
    clientId: oidcForm.clientId.trim(),
    clientSecret: oidcForm.clientSecret,
  })
  try {
    await $client.oidc.save({ providers: list })
    toast.add({ title: oidcEditingId.value ? 'Provider updated' : 'Provider added', color: 'success' })
    oidcEditorOpen.value = false
    await loadOidcProviders()
  }
  catch (e: unknown) {
    toast.add({ title: 'Save failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}

async function removeOidcProviderById(id: string) {
  const list = oidcProviders.value.filter(p => p.id !== id).map(p => ({ id: p.id, label: p.label, issuer: p.issuer, clientId: p.clientId, clientSecret: '' }))
  try {
    await $client.oidc.save({ providers: list })
    toast.add({ title: 'Provider removed', color: 'success' })
    await loadOidcProviders()
  }
  catch (e: unknown) {
    toast.add({ title: 'Remove failed', description: errorMessage(e), color: 'error' })
  }
}

async function saveSettings() {
  busy.value = true
  try {
    await $client.settings.save({
      disablePasswordLogin: settingsForm.disablePasswordLogin,
      logRetentionDays: settingsForm.logRetentionDays,
    })
    toast.add({ title: 'Settings saved', color: 'success' })
    await loadSettings()
  }
  catch (e: unknown) {
    toast.add({ title: 'Save failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}
</script>
