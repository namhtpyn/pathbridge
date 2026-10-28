<template>
  <div class="space-y-6">
    <PageHeader title="Roles" subtitle="Bundle permissions; assign to users on the Users page.">
      <template #actions>
        <UButton v-if="can('roles', 'create')" icon="i-lucide-plus" label="New role" @click="openRoleEditor()" />
      </template>
    </PageHeader>

    <UCard v-if="rolesPending || roles.length" :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <UTable v-if="rolesPending" :data="[]" :columns="roleColumns" :loading="true" />
      <UTable v-else :data="roles" :columns="roleColumns">
        <template #name-cell="{ row }">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-sm font-medium">{{ row.original.name }}</span>
            <UBadge v-if="row.original.builtin" color="neutral" variant="outline" size="sm" class="text-zinc-500 dark:text-zinc-400">builtin</UBadge>
          </div>
        </template>
        <template #description-cell="{ row }">
          <span v-if="row.original.description" class="text-sm text-zinc-500">{{ row.original.description }}</span>
        </template>
        <template #statements-cell="{ row }">
          <div class="flex flex-wrap gap-1.5">
            <template v-for="(stmts, res) in (row.original.statements as Record<string, string[]>)" :key="res">
              <UBadge v-for="st in stmts" :key="String(res) + st" variant="subtle" color="neutral" size="sm" class="font-mono">
                {{ res }}:{{ st }}
              </UBadge>
            </template>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <IconButton
              v-if="!row.original.builtin && can('roles', 'update')"
              text="Edit role" icon="i-lucide-pencil"
              @click="openRoleEditor(row.original)"
            />
            <IconButton
              v-if="!row.original.builtin && can('roles', 'delete')"
              text="Delete role" icon="i-lucide-trash-2" color="error"
              @click="askDeleteRole(row.original)"
            />
          </div>
        </template>
      </UTable>
    </UCard>
    <EmptyState v-else icon="i-lucide-shield" title="No roles yet" description="Bundle permissions into a reusable role" />

    <!-- role editor modal -->
    <FormModal
      v-model:open="roleModalOpen" :title="editingRoleId ? `Edit ${roleForm.name}` : 'New role'" :description="editingRoleId ? 'Adjust description and permissions' : 'Bundle permissions into a reusable role'"
      :form-id="roleFormId" :submit-label="editingRoleId ? 'Save changes' : 'Create role'" :submit-icon="editingRoleId ? 'i-lucide-check' : 'i-lucide-plus'" :busy="busy"
    >
      <UForm :id="roleFormId" :state="roleForm" :validate="validateRole" class="grid gap-5" @submit="saveRole">
        <UFormField name="name">
          <template #label>Name</template>
          <template #hint>
            <FieldHint title="Role name" example="e.g. auditor, deploy-eng">
              Unique slug for the role. Assigned to users and API keys; immutable once created.
            </FieldHint>
          </template>
          <UInput v-model="roleForm.name" icon="i-lucide-shield" placeholder="e.g. auditor" class="w-full" :disabled="!!editingRoleId" />
        </UFormField>
        <UFormField name="description">
          <template #label>Description</template>
          <template #hint>
            <FieldHint title="Description">
              Free-form note explaining what this role is for. Shown in the roles list.
            </FieldHint>
          </template>
          <UInput v-model="roleForm.description" icon="i-lucide-pen-line" placeholder="optional" class="w-full" />
        </UFormField>
        <UFormField name="permissions">
          <template #label>Permissions</template>
          <template #hint>
            <FieldHint title="Permissions" example="e.g. read:all, update:own">
              Statements follow action:scope. action:all implies action:own. Toggle the radios per resource; the master row sets every action at once.
            </FieldHint>
          </template>
          <PermissionMatrix v-model="roleForm.statements" :rows="permissionRows" :scope-available="scopeAvailable" />
        </UFormField>
      </UForm>
    </FormModal>

    <!-- delete confirm modal -->
    <ConfirmModal v-model:open="deleteModalOpen" title="Delete role" :description="deleteModal.what" :busy="deleteBusy" @confirm="confirmDelete" />
  </div>
</template>

<script setup lang="ts">

useHead({ title: 'Roles' })
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const { $client } = useNuxtApp()
const toast = useToast()
const busy = ref(false)

interface RoleRow { id: string, name: string, description: string | null, statements: Record<string, string[]>, builtin: boolean }
const roleColumns: TableColumn<RoleRow>[] = [
  { accessorKey: 'name', header: 'Role' },
  { accessorKey: 'description', header: 'Description' },
  { id: 'statements', header: 'Permissions', meta: { class: { td: 'w-full' } } },
  { id: 'actions', header: 'Actions', meta: { class: { th: 'sr-only' } } },
]
const roles = ref<RoleRow[]>([])
const rolesPending = ref(true)
const vocabulary = ref<Record<string, string[]>>({})
const roleModalOpen = ref(false)
const roleFormId = useId()
const roleForm = reactive({ name: '', description: '', statements: {} as Record<string, string[]> })
const editingRoleId = ref<string | null>(null)

async function loadRoles() {
  try {
    const data = await $client.roles.list()
    roles.value = data.roles as RoleRow[]
    vocabulary.value = data.vocabulary
  }
  catch (e: unknown) {
    toast.add({ title: 'Failed to load roles', description: errorMessage(e), color: 'error' })
  }
  rolesPending.value = false
}

onMounted(() => { void loadRoles() })

function validateRole(state: { name: string }): Array<{ name: string, message: string }> {
  const errs: Array<{ name: string, message: string }> = []
  if (!state.name.trim()) errs.push({ name: 'name', message: 'Name is required' })
  else if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(state.name.trim()) || state.name.trim().length < 2) errs.push({ name: 'name', message: '2-32 chars: lowercase letters, digits, hyphens' })
  return errs
}

function openRoleEditor(role?: RoleRow) {
  if (role) {
    editingRoleId.value = role.id
    roleForm.name = role.name
    roleForm.description = role.description ?? ''
    roleForm.statements = structuredClone(role.statements ?? {})
  }
  else {
    editingRoleId.value = null
    roleForm.name = ''
    roleForm.description = ''
    roleForm.statements = {}
  }
  roleModalOpen.value = true
}

/** Flat rows for the grouped permissions matrix. */
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

function scopeAvailable(resource: string, action: string, scope: 'own' | 'all'): boolean {
  return (vocabulary.value[resource] ?? []).includes(`${action}:${scope}`)
}

async function saveRole() {
  busy.value = true
  try {
    if (editingRoleId.value) {
      await $client.roles.update({ id: editingRoleId.value, description: roleForm.description.trim() || null, statements: roleForm.statements })
      toast.add({ title: 'Role updated', color: 'success' })
    }
    else {
      await $client.roles.save({ name: roleForm.name.trim().toLowerCase(), description: roleForm.description.trim() || null, statements: roleForm.statements })
      toast.add({ title: 'Role created', color: 'success' })
    }
    await loadRoles()
    roleModalOpen.value = false
  }
  catch (e: unknown) {
    toast.add({ title: editingRoleId.value ? 'Update failed' : 'Create failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}

// ---------- delete ----------
const deleteModalOpen = ref(false)
const deleteBusy = ref(false)
const deleteModal = reactive({ what: '', id: '' })

function askDeleteRole(r: RoleRow) {
  deleteModal.what = `role ${r.name}`
  deleteModal.id = r.id
  deleteModalOpen.value = true
}

async function confirmDelete() {
  deleteBusy.value = true
  try {
    await $client.roles.remove({ id: deleteModal.id })
    await loadRoles()
    toast.add({ title: 'Role deleted', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Delete failed', description: errorMessage(e), color: 'error' })
  }
  deleteBusy.value = false
  deleteModalOpen.value = false
}
</script>
