<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Roles</h2>
        <p class="text-sm text-zinc-500">Bundle permissions; assign to users on the Users page.</p>
      </div>
      <UButton icon="i-lucide-plus" label="New role" class="self-end sm:self-auto" :disabled="!can('roles', 'create')" @click="openRoleEditor()" />
    </div>

    <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <UTable :data="roles" :columns="roleColumns">
        <template #name-cell="{ row }">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-sm font-medium">{{ row.original.name }}</span>
            <UBadge v-if="row.original.builtin" color="neutral" variant="outline" size="sm" class="text-zinc-400">builtin</UBadge>
          </div>
        </template>
        <template #description-cell="{ row }">
          <span v-if="row.original.description" class="text-sm text-zinc-500">{{ row.original.description }}</span>
        </template>
        <template #statements-cell="{ row }">
          <div class="flex flex-wrap gap-1.5">
            <template v-for="(stmts, res) in (row.original.statements as Record<string, string[]>)" :key="res">
              <UBadge v-for="st in stmts" :key="String(res) + st" variant="subtle" size="sm" class="font-mono">
                {{ res }}:{{ st }}
              </UBadge>
            </template>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <UButton
              icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit role"
              :disabled="row.original.builtin || !can('roles', 'update')"
              @click="openRoleEditor(row.original)"
            />
            <UButton
              icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" aria-label="Delete role"
              :disabled="row.original.builtin || !can('roles', 'delete')"
              @click="deleteRole(row.original)"
            />
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- role editor modal -->
    <UModal v-model:open="roleModalOpen" :title="editingRoleId ? `Edit ${roleForm.name}` : 'New role'" :description="editingRoleId ? (builtinEdit ? 'Builtin roles cannot be modified' : 'Adjust description and permissions') : 'Bundle permissions into a reusable role'">
      <template #body>
        <UForm :state="roleForm" :validate="validateRole" class="grid gap-5" @submit="saveRole">
          <UFormField name="name">
            <template #label>Name</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Role name</p>
                    <p class="text-xs text-zinc-200">Unique slug for the role. Assigned to users and API keys; immutable once created.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. auditor, deploy-eng</p>
                  </div>
                </template>
            </UPopover></template>
            <UInput v-model="roleForm.name" icon="i-lucide-shield" placeholder="e.g. auditor" class="w-full" :disabled="!!editingRoleId" />
          </UFormField>
          <UFormField name="description">
            <template #label>Description</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Description</p>
                    <p class="text-xs text-zinc-200">Free-form note explaining what this role is for. Shown in the roles list.</p>
                  </div>
                </template>
            </UPopover></template>
            <UInput v-model="roleForm.description" icon="i-lucide-pen-line" placeholder="optional" class="w-full" />
          </UFormField>
          <UFormField name="permissions">
            <template #label>Permissions</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Permissions</p>
                    <p class="text-xs text-zinc-200">Statements follow action:scope. action:all implies action:own. Toggle the radios per resource; the master row sets every action at once.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. read:all, update:own</p>
                  </div>
                </template>
            </UPopover></template>
            <div class="w-full space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <UTable
                :data="permissionRows"
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
                      :model-value="masterScopeFor(row.original.resource)"
                      :items="[{ label: '', value: 'none' }]"
                      variant="list"
                      :name="`${row.original.resource}-master-none`"
                      :ui="{ fieldset: 'justify-center' }"
                      @update:model-value="() => setMasterScope(row.original.resource, 'none')"
                    />
                  </div>
                  <div v-else class="flex justify-center">
                    <URadioGroup
                      :model-value="scopeFor(row.original.resource, row.original.action)"
                      :items="[{ label: '', value: 'none' }]"
                      variant="list"
                      :name="`${row.original.resource}-${row.original.action}-none`"
                      :ui="{ fieldset: 'justify-center' }"
                      @update:model-value="() => setScope(row.original.resource, row.original.action, 'none')"
                    />
                  </div>
                </template>
                <template #own-cell="{ row }">
                  <div v-if="row.getIsGrouped() && masterOwnAvailable(row.original.resource)" class="flex justify-center">
                    <URadioGroup
                      :model-value="masterScopeFor(row.original.resource)"
                      :items="[{ label: '', value: 'own' }]"
                      variant="list"
                      :name="`${row.original.resource}-master-own`"
                      :ui="{ fieldset: 'justify-center' }"
                      @update:model-value="() => setMasterScope(row.original.resource, 'own')"
                    />
                  </div>
                  <div v-else-if="!row.getIsGrouped() && scopeAvailable(row.original.resource, row.original.action, 'own')" class="flex justify-center">
                    <URadioGroup
                      :model-value="scopeFor(row.original.resource, row.original.action)"
                      :items="[{ label: '', value: 'own' }]"
                      variant="list"
                      :name="`${row.original.resource}-${row.original.action}-own`"
                      :ui="{ fieldset: 'justify-center' }"
                      @update:model-value="() => setScope(row.original.resource, row.original.action, 'own')"
                    />
                  </div>
                </template>
                <template #all-cell="{ row }">
                  <div v-if="row.getIsGrouped()" class="flex justify-center">
                    <URadioGroup
                      :model-value="masterScopeFor(row.original.resource)"
                      :items="[{ label: '', value: 'all' }]"
                      variant="list"
                      :name="`${row.original.resource}-master-all`"
                      :ui="{ fieldset: 'justify-center' }"
                      @update:model-value="() => setMasterScope(row.original.resource, 'all')"
                    />
                  </div>
                  <div v-else-if="!row.getIsGrouped() && scopeAvailable(row.original.resource, row.original.action, 'all')" class="flex justify-center">
                    <URadioGroup
                      :model-value="scopeFor(row.original.resource, row.original.action)"
                      :items="[{ label: '', value: 'all' }]"
                      variant="list"
                      :name="`${row.original.resource}-${row.original.action}-all`"
                      :ui="{ fieldset: 'justify-center' }"
                      @update:model-value="() => setScope(row.original.resource, row.original.action, 'all')"
                    />
                  </div>
                </template>
              </UTable>
            </div>
          </UFormField>
          <div class="flex items-end justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="roleModalOpen = false" />
            <UButton type="submit" :icon="editingRoleId ? 'i-lucide-check' : 'i-lucide-plus'" :loading="busy" :label="editingRoleId ? 'Save changes' : 'Create role'" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getGroupedRowModel } from '@tanstack/vue-table'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const toast = useToast()
const busy = ref(false)

interface RoleRow { id: string, name: string, description: string | null, statements: Record<string, string[]>, builtin: boolean }
const roleColumns: TableColumn<RoleRow>[] = [
  { accessorKey: 'name', header: 'Role' },
  { accessorKey: 'description', header: 'Description' },
  { id: 'statements', header: 'Permissions', meta: { class: { td: 'w-full' } } },
  { id: 'actions', header: '' },
]
const roles = ref<RoleRow[]>([])
const vocabulary = ref<Record<string, string[]>>({})
const roleModalOpen = ref(false)
const roleForm = reactive({ name: '', description: '', statements: {} as Record<string, string[]> })
const editingRoleId = ref<string | null>(null)
const builtinEdit = computed(() => roles.value.find(r => r.id === editingRoleId.value)?.builtin ?? false)

async function loadRoles() {
  const data = await useNuxtApp().$client.roles.list()
  roles.value = data.roles as RoleRow[]
  vocabulary.value = data.vocabulary
}

onMounted(() => { loadRoles().catch(() => {}) })

function validateRole(state: { name: string }): Array<{ name: string, message: string }> {
  const errs: Array<{ name: string, message: string }> = []
  if (!state.name.trim()) errs.push({ name: 'name', message: 'Name is required' })
  else if (!/^[a-z0-9][a-z0-9-]{1,32}$/.test(state.name.trim())) errs.push({ name: 'name', message: '2-32 chars: lowercase letters, digits, hyphens' })
  return errs
}

function openRoleEditor(role?: RoleRow) {
  if (role) {
    editingRoleId.value = role.id
    roleForm.name = role.name
    roleForm.description = role.description ?? ''
    roleForm.statements = JSON.parse(JSON.stringify(role.statements ?? {}))
  }
  else {
    editingRoleId.value = null
    roleForm.name = ''
    roleForm.description = ''
    roleForm.statements = {}
  }
  roleModalOpen.value = true
}

/** Flat rows for the grouped permissions UTable. */
const permissionRows = computed<{ resource: string, action: string }[]>(() => {
  const rows: { resource: string, action: string }[] = []
  for (const [resource, stmts] of Object.entries(vocabulary.value)) {
    const actions: string[] = []
    for (const st of stmts ?? []) {
      const a = st.split(':')[0] ?? ''
      if (a && !actions.includes(a)) actions.push(a)
    }
    for (const action of actions) rows.push({ resource, action })
  }
  return rows
})

const permissionColumns: TableColumn<{ resource: string, action: string }>[] = [
  { accessorKey: 'resource', header: 'Resource' },
  { accessorKey: 'action', header: 'Action', meta: { class: { td: 'w-full' } } },
  { id: 'none', header: 'None', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
  { id: 'own', header: 'Own', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
  { id: 'all', header: 'All', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
]

/** Actions available for a resource, derived from the statement vocabulary. */
function resourceActions(resource: string): string[] {
  const stmts: string[] = vocabulary.value[resource] ?? []
  const actions: string[] = []
  for (const st of stmts) {
    const a = st!.split(':')[0] ?? ''
    if (a && !actions.includes(a)) actions.push(a)
  }
  return actions
}

function scopeAvailable(resource: string, action: string, scope: string): boolean {
  return (vocabulary.value[resource] ?? []).includes(`${action}:${scope}`)
}

function scopeFor(resource: string, action: string): 'none' | 'own' | 'all' {
  const cur = roleForm.statements[resource] ?? []
  if (cur.includes(`${action}:all`)) return 'all'
  if (cur.includes(`${action}:own`)) return 'own'
  return 'none'
}

function masterScopeFor(resource: string): 'none' | 'own' | 'all' | 'mixed' {
  const actions = resourceActions(resource)
  if (!actions.length) return 'none'
  const scopes = actions.map(a => scopeFor(resource, a))
  const first = scopes[0] ?? 'none'
  if (scopes.every(x => x === first)) return first
  return 'mixed'
}

function masterOwnAvailable(resource: string): boolean {
  return resourceActions(resource).some(a => scopeAvailable(resource, a, 'own'))
}

function setMasterScope(resource: string, scope: 'none' | 'own' | 'all') {
  const next: string[] = []
  for (const a of resourceActions(resource)) {
    if (scope !== 'none' && scopeAvailable(resource, a, scope)) next.push(`${a}:${scope}`)
  }
  roleForm.statements[resource] = next
}

function setScope(resource: string, action: string, scope: 'none' | 'own' | 'all') {
  const cur = new Set(roleForm.statements[resource] ?? [])
  cur.delete(`${action}:all`)
  cur.delete(`${action}:own`)
  if (scope !== 'none') cur.add(`${action}:${scope}`)
  roleForm.statements[resource] = [...cur]
}

async function saveRole() {
  busy.value = true
  try {
    if (editingRoleId.value) {
      await useNuxtApp().$client.roles.update({ id: editingRoleId.value, description: roleForm.description.trim() || null, statements: roleForm.statements })
      toast.add({ title: 'Role updated', color: 'success' })
    }
    else {
      await useNuxtApp().$client.roles.save({ name: roleForm.name.trim().toLowerCase(), description: roleForm.description.trim() || null, statements: roleForm.statements })
      toast.add({ title: 'Role created', color: 'success' })
    }
    await loadRoles()
    roleModalOpen.value = false
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: editingRoleId.value ? 'Update failed' : 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function deleteRole(r: RoleRow) {
  try {
    await useNuxtApp().$client.roles.remove({ id: r.id })
    await loadRoles()
    toast.add({ title: 'Role deleted', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}
</script>
