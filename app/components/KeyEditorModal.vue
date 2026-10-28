<template>
  <FormModal
    :open="open" title="Create API key" description="Scoped keys can only narrow your own permissions"
    :form-id="keyFormId" submit-label="Create key" submit-icon="i-lucide-key-round" :busy="busy"
    @update:open="v => emit('update:open', v)"
  >
    <UForm :id="keyFormId" :state="keyForm" class="space-y-4" @submit="createKey">
        <UFormField name="keyName" label="Name" required>
          <UInput v-model="keyForm.name" icon="i-lucide-tag" class="w-full" placeholder="ci-deploy" />
        </UFormField>
        <UFormField name="keyExpiry" label="Expires in (days)" help="0 or empty = no expiry">
          <UInputNumber v-model="keyForm.expiresInDays" :min="0" :max="365" class="w-full" />
        </UFormField>
        <USeparator />
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-900 dark:text-white">Permission scope</span>
            <USwitch v-model="keyForm.scoped" label="Restrict permissions" size="sm" />
          </div>
          <p v-if="!keyForm.scoped" class="text-xs text-zinc-500">Key inherits all your permissions ({{ session?.user.email }}).</p>
          <div v-else>
            <PermissionMatrix
              v-model="keyForm.scope"
              :rows="keyPermissionRows"
              :scope-available="keyGrantable"
            />
          </div>
      </div>
    </UForm>
  </FormModal>
</template>

<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], created: [key: string] }>()

const { session, perms, vocabulary } = await useAdminSession()
const toast = useToast()
const { $client } = useNuxtApp()
const busy = ref(false)
const keyFormId = useId()

const keyForm = reactive({ name: '', expiresInDays: 0, scoped: false, scope: {} as Record<string, string[]> })
/** rows for the key scope matrix: only resource:action routes the CURRENT user has */
const keyPermissionRows = computed<{ resource: string, action: string }[]>(() => {
  const rows: { resource: string, action: string }[] = []
  for (const [resource, statements] of Object.entries(perms.value)) {
    const actions: string[] = []
    for (const st of statements ?? []) {
      const a = st.split(':')[0] ?? ''
      if (a && !actions.includes(a)) actions.push(a)
    }
    for (const action of actions) rows.push({ resource, action })
  }
  return rows
})

/** does the current user hold resource:statement (all implies own)? */
function iHave(resource: string, statement: string): boolean {
  const mine = perms.value[resource] ?? []
  if (mine.includes(statement)) return true
  if (statement.endsWith(':own') && mine.includes(statement.replace(':own', ':all'))) return true
  return false
}

/** key grantability: a VALID vocabulary statement the current user also holds (narrow-only law) */
function keyGrantable(resource: string, action: string, scope: 'own' | 'all'): boolean {
  return (vocabulary.value[resource] ?? []).includes(`${action}:${scope}`) && iHave(resource, `${action}:${scope}`)
}

// reset the editor each time it opens (the shared admin-session state already
// carries the vocabulary — no per-open fetch)
watch(() => props.open, (o) => {
  if (o) {
    keyForm.name = ''
    keyForm.expiresInDays = 0
    keyForm.scoped = false
    keyForm.scope = {}
  }
})

async function createKey() {
  // "Restrict permissions" with nothing selected must NOT fall through to an
  // unrestricted key (the server omits empty permissions = inherit all)
  if (keyForm.scoped && Object.keys(keyForm.scope).length === 0) {
    toast.add({ title: 'Pick at least one permission', description: 'Restricting with no scopes would create a full-access key', color: 'error' })
    return
  }
  if (!keyForm.name.trim()) {
    toast.add({ title: 'Name required', color: 'error' })
    return
  }
  busy.value = true
  try {
    const body: Record<string, unknown> = { name: keyForm.name.trim() }
    if (keyForm.expiresInDays && keyForm.expiresInDays > 0) body.expiresIn = keyForm.expiresInDays * 86400
    if (keyForm.scoped && Object.keys(keyForm.scope).length > 0) body.permissions = keyForm.scope
    const r = await $client.keys.create(body as { name: string, expiresIn?: number, permissions?: Record<string, string[]> })
    emit('created', r.key)
    emit('update:open', false)
  }
  catch (e: unknown) {
    toast.add({ title: 'Create failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}
</script>
