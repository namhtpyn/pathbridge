<template>
  <div class="space-y-6">
    <PageHeader title="Users" subtitle="Who can manage this bridge">
      <template #actions>
        <UButton v-if="can('users', 'create')" icon="i-lucide-user-plus" label="Add user" @click="showAddUser = true" />
      </template>
    </PageHeader>

    <!-- add user modal -->
    <FormModal
      :open="showAddUser" title="Add user" description="Create a new account and assign its role"
      :form-id="addUserFormId" submit-label="Create user" submit-icon="i-lucide-user-plus" :busy="busy"
      @update:open="v => showAddUser = v"
    >
      <UForm :id="addUserFormId" :state="newUser" :validate="validateNewUser" class="grid gap-5 sm:grid-cols-2" @submit="addUser">
        <UFormField label="Email" name="email">
          <UInput v-model="newUser.email" type="email" icon="i-lucide-mail" class="w-full" />
        </UFormField>
        <UFormField label="Name" name="name">
          <UInput v-model="newUser.name" icon="i-lucide-user" class="w-full" />
        </UFormField>
        <UFormField name="password">
          <template #label>Password</template>
          <template #hint>
            <FieldHint title="Password" example="e.g. min 8 characters">
              Initial password for the new user — they (or you) can change it later via Reset password.
            </FieldHint>
          </template>
          <UInput v-model="newUser.password" type="password" icon="i-lucide-lock" class="w-full" />
        </UFormField>
        <UFormField v-if="can('roles', 'update')" name="role">
          <template #label>Role</template>
          <template #hint>
            <FieldHint title="Role">
              Role assigned to the new user. Defaults to viewer. Requires roles:update permission.
            </FieldHint>
          </template>
          <USelect v-model="newUser.role" :items="roleOptions" class="w-full" />
        </UFormField>
      </UForm>
    </FormModal>

    <!-- edit user modal -->
    <FormModal
      v-model:open="userEditOpen" :title="`Edit ${userEditForm.name || userEditForm.email}`" description="Update name, email or role"
      :form-id="editUserFormId" submit-label="Save changes" submit-icon="i-lucide-check" :busy="busy"
    >
      <UForm :id="editUserFormId" :state="userEditForm" class="grid gap-5" @submit="saveUserEdit">
        <UFormField label="Name" name="name">
          <UInput v-model="userEditForm.name" icon="i-lucide-user" class="w-full" />
        </UFormField>
        <UFormField label="Email" name="email">
          <UInput v-model="userEditForm.email" type="email" icon="i-lucide-mail" class="w-full" />
        </UFormField>
        <UFormField v-if="can('roles', 'update')" name="role">
          <template #label>Role</template>
          <template #hint>
            <FieldHint title="Role">
              Changing role takes effect on the user's next request.
            </FieldHint>
          </template>
          <USelect v-model="userEditForm.role" :items="roleOptions" class="w-full" />
        </UFormField>
        <UFormField name="emailVerifiedEdit">
          <template #label>Email verified</template>
          <template #hint>
            <FieldHint title="Email verified">
              OIDC accounts auto-link to existing users only when the local account is verified.
            </FieldHint>
          </template>
          <USwitch v-model="userEditForm.emailVerified" label="Email is verified" />
        </UFormField>
      </UForm>
    </FormModal>

    <!-- password reset modal -->
    <FormModal
      v-model:open="pwModalOpen" title="Reset password" description="Set a new password for this user"
      :form-id="pwFormId" submit-label="Set password" submit-icon="i-lucide-key-round" :busy="busy"
    >
      <UForm :id="pwFormId" :state="pwModal" class="space-y-4" @submit="submitPasswordReset">
        <UFormField label="New password" name="password" help="Minimum 8 characters">
          <UInput v-model="pwModal.password" type="password" icon="i-lucide-lock" class="w-full" required />
        </UFormField>
      </UForm>
    </FormModal>

    <!-- delete confirm modal -->
    <ConfirmModal v-model:open="deleteModalOpen" title="Delete user" :description="deleteModal.what" :busy="deleteBusy" @confirm="confirmDelete" />

    <UCard v-if="usersPending || users.length" :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <UTable v-if="usersPending" :data="[]" :columns="userColumns" :loading="true" />
      <UTable v-else :data="users" :columns="userColumns">
        <template #user-cell="{ row }">
          <div class="flex items-center gap-3">
            <UAvatar :alt="row.original.name || row.original.email" :text="avatarInitials(row.original)" size="sm" />
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-zinc-900 dark:text-white">{{ row.original.name }}</span>
                <UBadge v-if="session?.user?.id && row.original.id === session.user.id" label="you" variant="subtle" color="primary" size="sm" />
              </div>
              <div class="truncate text-xs text-zinc-500">{{ row.original.email }}</div>
            </div>
          </div>
        </template>
        <template #role-cell="{ row }">
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
            <UBadge class="font-mono" variant="subtle" color="neutral" size="sm">{{ row.original.role }}</UBadge>
            <span v-if="row.original.hasPassword" class="flex items-center gap-1"><UIcon name="i-lucide-lock" class="size-3" />password</span>
            <span v-if="row.original.oidcLinked" class="flex items-center gap-1"><UIcon name="i-lucide-key-round" class="size-3" />oidc</span>
            <span class="flex items-center gap-1"><UIcon name="i-lucide-monitor-smartphone" class="size-3" aria-hidden="true" /><span class="sr-only">active sessions:</span>{{ row.original.sessionCount }}</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <IconButton v-if="can('users', 'update')" text="Edit user" icon="i-lucide-pencil" @click="openUserEditor(row.original)" />
            <IconButton v-if="can('users', 'update')" text="Reset password" icon="i-lucide-key-round" @click="resetPassword(row.original)" />
            <IconButton text="Delete user" icon="i-lucide-trash-2" color="error" :disabled="Boolean(session?.user?.id && row.original.id === session.user.id)" @click="removeUser(row.original)" />
          </div>
        </template>
      </UTable>
    </UCard>
    <EmptyState v-else icon="i-lucide-users" title="No users yet" description="Create a user to grant admin access" />
  </div>
</template>

<script setup lang="ts">

useHead({ title: 'Users' })
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })
const { session, can } = await useAdminSession()
const toast = useToast()
const { $client } = useNuxtApp()
const busy = ref(false)
const addUserFormId = useId()
const editUserFormId = useId()
const pwFormId = useId()

interface AdminUser { id: string, name: string, email: string, emailVerified: boolean, role: string, createdAt: string, sessionCount: number, hasPassword: boolean, oidcLinked: boolean }

/** two-letter initials for the avatar fallback (name words, else email local-part) */
function avatarInitials(u: AdminUser): string {
  const src = (u.name || u.email).trim()
  if (!src) return ''
  const words = src.split(/\s+/)
  if (words.length > 1) return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase()
  const local = src.split('@')[0]!
  return local.slice(0, 2).toUpperCase()
}
const userColumns: TableColumn<AdminUser>[] = [
  { id: 'user', header: 'User' },
  { id: 'role', header: 'Role & auth', meta: { class: { td: 'w-full' } } },
  { id: 'actions', header: 'Actions', meta: { class: { th: 'sr-only' } } },
]

const users = ref<AdminUser[]>([])
const usersPending = ref(true)
const roles = ref<{ id: string, name: string }[]>([])
const roleOptions = computed(() => roles.value.map(r => ({ label: r.name, value: r.name })))

onMounted(async () => {
  await refresh()
})

async function refresh() {
  try {
    const [u, r] = await Promise.all([
      $client.users.list(),
      can('roles', 'read') ? $client.roles.list().then(r => ({ roles: r.roles as { id: string, name: string }[] })).catch(() => ({ roles: [] as { id: string, name: string }[] })) : Promise.resolve({ roles: [] as { id: string, name: string }[] }),
    ])
    users.value = u.users as AdminUser[]
    roles.value = r.roles
  }
  catch (e: unknown) {
    toast.add({ title: 'Failed to load users', description: errorMessage(e), color: 'error' })
  }
  finally { usersPending.value = false }
}

const showAddUser = ref(false)
const newUser = reactive({ email: '', name: '', password: '', role: 'viewer', emailVerified: true })
const userEditOpen = ref(false)
const userEditForm = reactive({ id: '', name: '', email: '', role: 'viewer', emailVerified: true })

function validateNewUser(state: typeof newUser): Array<{ name: string, message: string }> {
  const errors: Array<{ name: string, message: string }> = []
  if (!/^\S+@\S+\.\S+$/.test(state.email)) errors.push({ name: 'email', message: 'Enter a valid email' })
  if (state.name.trim().length === 0) errors.push({ name: 'name', message: 'Name is required' })
  if (state.password.length < 8) errors.push({ name: 'password', message: 'At least 8 characters' })
  return errors
}

function openUserEditor(u: AdminUser) {
  userEditForm.id = u.id
  userEditForm.name = u.name
  userEditForm.email = u.email
  userEditForm.role = u.role
  userEditForm.emailVerified = u.emailVerified
  userEditOpen.value = true
}

async function saveUserEdit() {
  busy.value = true
  try {
    const body: Record<string, string | boolean> = {}
    if (userEditForm.name.trim()) body.name = userEditForm.name.trim()
    if (userEditForm.email.trim()) body.email = userEditForm.email.trim()
    if (can('roles', 'update')) body.role = userEditForm.role
    body.emailVerified = userEditForm.emailVerified
    await $client.users.update({ id: userEditForm.id, ...body })
    await refresh()
    userEditOpen.value = false
    toast.add({ title: 'User updated', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Update failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}

async function addUser() {
  busy.value = true
  try {
    const body: { email: string, name: string, password: string, emailVerified: boolean, role?: string } = { email: newUser.email.trim(), name: newUser.name.trim(), password: newUser.password, emailVerified: newUser.emailVerified }
    if (can('roles', 'update')) body.role = newUser.role
    await $client.users.save(body)
    newUser.email = ''
    newUser.name = ''
    newUser.password = ''
    newUser.role = 'viewer'
    showAddUser.value = false
    await refresh()
    toast.add({ title: 'User created', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Create failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}

const pwModalOpen = ref(false)
const pwModal = reactive({ userId: '', email: '', password: '' })

function resetPassword(u: AdminUser) {
  pwModal.userId = u.id
  pwModal.email = u.email
  pwModal.password = ''
  pwModalOpen.value = true
}

async function submitPasswordReset() {
  if (pwModal.password.length < 8) {
    toast.add({ title: 'Too short', description: 'Password must be at least 8 characters', color: 'error' })
    return
  }
  busy.value = true
  try {
    await $client.users.setPassword({ id: pwModal.userId, password: pwModal.password })
    pwModalOpen.value = false
    toast.add({ title: `Password updated for ${pwModal.email}`, color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Reset failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}

const deleteModalOpen = ref(false)
const deleteBusy = ref(false)
const deleteModal = reactive({ what: '', id: '' })

function removeUser(u: AdminUser) {
  deleteModal.what = `user ${u.email} and all their sessions`
  deleteModal.id = u.id
  deleteModalOpen.value = true
}

async function confirmDelete() {
  deleteBusy.value = true
  try {
    await $client.users.remove({ id: deleteModal.id })
    await refresh()
    toast.add({ title: 'User deleted', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Delete failed', description: errorMessage(e), color: 'error' })
  }
  deleteBusy.value = false
  deleteModalOpen.value = false
}
</script>
