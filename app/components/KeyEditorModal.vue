<template>
  <UModal :open="open" title="Create API key" description="Scoped keys can only narrow your own permissions" @update:open="v => emit('update:open', v)">
    <template #body>
      <UForm :state="keyForm" class="space-y-4" @submit="createKey">
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
          <div v-else class="w-full space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <p class="text-xs text-zinc-400">Only permissions you have are shown — a key can never exceed its owner.</p>
            <UTable
              :data="keyPermissionRows"
              :columns="permissionColumns"
              :grouping="['resource']"
              :grouping-options="{ groupedColumnMode: false, getGroupedRowModel: getGroupedRowModel() }"
              :ui="{ root: 'min-w-full', td: 'empty:p-0' }"
            >
              <template #resource-cell="{ row }">
                <div v-if="row.getIsGrouped()" class="flex items-center gap-2">
                  <UButton
                    variant="ghost" color="neutral" size="xs"
                    :icon="row.getIsExpanded() ? 'i-lucide-minus' : 'i-lucide-plus'"
                    aria-label="Toggle group"
                    @click="row.toggleExpanded()"
                  />
                  <span class="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{{ row.original.resource }}</span>
                </div>
                <span v-else class="invisible">&middot;</span>
              </template>
              <template #action-cell="{ row }">
                <span v-if="!row.getIsGrouped()" class="font-mono text-xs text-zinc-500 dark:text-zinc-400">{{ row.original.action }}</span>
              </template>
              <template #none-cell="{ row }">
                <div v-if="row.getIsGrouped()" class="flex justify-center">
                  <URadioGroup
                    :model-value="keyMasterScopeFor(row.original.resource)"
                    :items="[{ label: '', value: 'none' }]"
                    variant="list"
                    :name="`key-${row.original.resource}-master-none`"
                    :ui="{ fieldset: 'justify-center' }"
                    @update:model-value="() => setKeyMasterScope(row.original.resource, 'none')"
                  />
                </div>
                <div v-else class="flex justify-center">
                  <URadioGroup
                    :model-value="keyScopeFor(row.original.resource, row.original.action)"
                    :items="[{ label: '', value: 'none' }]"
                    variant="list"
                    :name="`key-${row.original.resource}-${row.original.action}-none`"
                    :ui="{ fieldset: 'justify-center' }"
                    @update:model-value="() => setKeyScope(row.original.resource, row.original.action, 'none')"
                  />
                </div>
              </template>
              <template #own-cell="{ row }">
                <div v-if="row.getIsGrouped() && keyMasterOwnAvailable(row.original.resource)" class="flex justify-center">
                  <URadioGroup
                    :model-value="keyMasterScopeFor(row.original.resource)"
                    :items="[{ label: '', value: 'own' }]"
                    variant="list"
                    :name="`key-${row.original.resource}-master-own`"
                    :ui="{ fieldset: 'justify-center' }"
                    @update:model-value="() => setKeyMasterScope(row.original.resource, 'own')"
                  />
                </div>
                <div v-else-if="!row.getIsGrouped() && keyScopeValid(row.original.resource, row.original.action, 'own') && iHave(row.original.resource, `${row.original.action}:own`)" class="flex justify-center">
                  <URadioGroup
                    :model-value="keyScopeFor(row.original.resource, row.original.action)"
                    :items="[{ label: '', value: 'own' }]"
                    variant="list"
                    :name="`key-${row.original.resource}-${row.original.action}-own`"
                    :ui="{ fieldset: 'justify-center' }"
                    @update:model-value="() => setKeyScope(row.original.resource, row.original.action, 'own')"
                  />
                </div>
              </template>
              <template #all-cell="{ row }">
                <div v-if="row.getIsGrouped() && keyMasterAllAvailable(row.original.resource)" class="flex justify-center">
                  <URadioGroup
                    :model-value="keyMasterScopeFor(row.original.resource)"
                    :items="[{ label: '', value: 'all' }]"
                    variant="list"
                    :name="`key-${row.original.resource}-master-all`"
                    :ui="{ fieldset: 'justify-center' }"
                    @update:model-value="() => setKeyMasterScope(row.original.resource, 'all')"
                  />
                </div>
                <div v-else-if="!row.getIsGrouped() && keyScopeValid(row.original.resource, row.original.action, 'all') && iHave(row.original.resource, `${row.original.action}:all`)" class="flex justify-center">
                  <URadioGroup
                    :model-value="keyScopeFor(row.original.resource, row.original.action)"
                    :items="[{ label: '', value: 'all' }]"
                    variant="list"
                    :name="`key-${row.original.resource}-${row.original.action}-all`"
                    :ui="{ fieldset: 'justify-center' }"
                    @update:model-value="() => setKeyScope(row.original.resource, row.original.action, 'all')"
                  />
                </div>
              </template>
            </UTable>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="emit('update:open', false)" />
          <UButton type="submit" icon="i-lucide-key-round" :loading="busy" label="Create key" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getGroupedRowModel } from '@tanstack/vue-table'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], created: [key: string] }>()

const { session, perms } = await useAdminSession()
const toast = useToast()
const busy = ref(false)

const keyForm = reactive({ name: '', expiresInDays: 0, scoped: false, scope: {} as Record<string, string[]> })
const permissionColumns: TableColumn<{ resource: string, action: string }>[] = [
  { accessorKey: 'resource', header: 'Resource' },
  { accessorKey: 'action', header: 'Action', meta: { class: { td: 'w-full' } } },
  { id: 'none', header: 'None', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
  { id: 'own', header: 'Own', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
  { id: 'all', header: 'All', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
]

/** rows for the key scope matrix: only resource:action routes the CURRENT user has */
const keyPermissionRows = computed<{ resource: string, action: string }[]>(() => {
  const rows: { resource: string, action: string }[] = []
  for (const [resource, statements] of Object.entries(perms.value)) {
    const actions: string[] = []
    for (const st of statements ?? []) {
      const a = st!.split(':')[0] ?? ''
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

/** is action:scope a VALID statement in the RBAC vocabulary for this resource? */
function keyScopeValid(resource: string, action: string, scope: string): boolean {
  return (vocabulary.value[resource] ?? []).includes(`${action}:${scope}`)
}

/** key radio state for a row: none | own | all */
function keyScopeFor(resource: string, action: string): 'none' | 'own' | 'all' {
  const cur = keyForm.scope[resource] ?? []
  if (cur.includes(`${action}:all`)) return 'all'
  if (cur.includes(`${action}:own`)) return 'own'
  return 'none'
}

/** master radio for a resource group; mixed when actions disagree */
function keyMasterScopeFor(resource: string): 'none' | 'own' | 'all' | 'mixed' {
  const actions = keyPermissionRows.value.filter(r => r.resource === resource).map(r => r.action)
  if (!actions.length) return 'none'
  const scopes = actions.map(a => keyScopeFor(resource, a))
  const first = scopes[0] ?? 'none'
  if (scopes.every(x => x === first)) return first
  return 'mixed'
}

function setKeyScope(resource: string, action: string, scope: 'none' | 'own' | 'all') {
  const cur = new Set(keyForm.scope[resource] ?? [])
  cur.delete(`${action}:all`)
  cur.delete(`${action}:own`)
  if (scope !== 'none' && keyScopeValid(resource, action, scope)) cur.add(`${action}:${scope}`)
  if (cur.size > 0) keyForm.scope[resource] = [...cur]
  else delete keyForm.scope[resource]
}

function setKeyMasterScope(resource: string, scope: 'none' | 'own' | 'all') {
  const rows = keyPermissionRows.value.filter(r => r.resource === resource)
  for (const r of rows) {
    if (scope === 'none') { setKeyScope(resource, r.action, 'none'); continue }
    if (scope === 'own' && !(keyScopeValid(resource, r.action, 'own') && iHave(resource, `${r.action}:own`))) { setKeyScope(resource, r.action, 'none'); continue }
    if (scope === 'all' && !(keyScopeValid(resource, r.action, 'all') && iHave(resource, `${r.action}:all`))) { setKeyScope(resource, r.action, 'none'); continue }
    setKeyScope(resource, r.action, scope)
  }
}

function keyMasterOwnAvailable(resource: string): boolean {
  return keyPermissionRows.value.some(r => r.resource === resource && keyScopeValid(resource, r.action, 'own') && iHave(resource, `${r.action}:own`))
}

function keyMasterAllAvailable(resource: string): boolean {
  return keyPermissionRows.value.some(r => r.resource === resource && keyScopeValid(resource, r.action, 'all') && iHave(resource, `${r.action}:all`))
}

// vocabulary (valid statements per resource) — fetched once per editor open
const vocabulary = ref<Record<string, string[]>>({})
watch(() => props.open, async (o) => {
  if (o) {
    keyForm.name = ''
    keyForm.expiresInDays = 0
    keyForm.scoped = false
    keyForm.scope = {}
    try {
      const r = await $fetch<{ vocabulary: Record<string, string[]> }>('/api/roles')
      vocabulary.value = r.vocabulary
    }
    catch { vocabulary.value = {} }
  }
})

async function createKey() {
  busy.value = true
  try {
    const body: Record<string, unknown> = { name: keyForm.name.trim() }
    if (keyForm.expiresInDays && keyForm.expiresInDays > 0) body.expiresIn = keyForm.expiresInDays * 86400
    if (keyForm.scoped && Object.keys(keyForm.scope).length > 0) body.permissions = keyForm.scope
    const r = await $fetch<{ key: string }>('/api/keys', { method: 'POST', body })
    emit('created', r.key)
    emit('update:open', false)
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}
</script>
