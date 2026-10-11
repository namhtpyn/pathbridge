<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Users</h2>
        <p class="text-sm text-zinc-500">Who can manage this bridge</p>
      </div>
      <UButton icon="i-lucide-user-plus" label="Add user" class="self-end sm:self-auto" @click="showAddUser = true" />
    </div>

    <!-- add user modal -->
    <UModal :open="showAddUser" title="Add user" description="Create a new account and assign its role" @update:open="v => showAddUser = v">
      <template #body>
        <UForm :state="newUser" :validate="validateNewUser" class="grid gap-5 sm:grid-cols-2" @submit="addUser">
          <UFormField label="Email" name="email">
            <UInput v-model="newUser.email" type="email" icon="i-lucide-mail" class="w-full" />
          </UFormField>
          <UFormField label="Name" name="name">
            <UInput v-model="newUser.name" icon="i-lucide-user" class="w-full" />
          </UFormField>
          <UFormField name="password">
            <template #label>Password</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Password</p>
                    <p class="text-xs text-zinc-200">Initial password for the new user — they (or you) can change it later via Reset password.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. min 8 characters</p>
                  </div>
                </template>
              </UPopover></template>
            <UInput v-model="newUser.password" type="password" icon="i-lucide-lock" class="w-full" />
          </UFormField>
          <UFormField v-if="can('roles', 'update')" name="role">
            <template #label>Role</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Role</p>
                    <p class="text-xs text-zinc-200">Role assigned to the new user. Defaults to viewer. Requires roles:update permission.</p>
                  </div>
                </template>
              </UPopover></template>
            <USelect v-model="newUser.role" :items="roleOptions" class="w-full" />
          </UFormField>
          <div class="flex items-end justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="showAddUser = false" />
            <UButton type="submit" icon="i-lucide-user-plus" :loading="busy" label="Create user" />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- edit user modal -->
    <UModal v-model:open="userEditOpen" :title="`Edit ${userEditForm.name || userEditForm.email}`" description="Update name, email or role">
      <template #body>
        <UForm :state="userEditForm" class="grid gap-5" @submit="saveUserEdit">
          <UFormField label="Name" name="name">
            <UInput v-model="userEditForm.name" icon="i-lucide-user" class="w-full" />
          </UFormField>
          <UFormField label="Email" name="email">
            <UInput v-model="userEditForm.email" type="email" icon="i-lucide-mail" class="w-full" />
          </UFormField>
          <UFormField v-if="can('roles', 'update')" name="role">
            <template #label>Role</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Role</p>
                    <p class="text-xs text-zinc-200">Changing role takes effect on the user's next request.</p>
                  </div>
                </template>
              </UPopover></template>
            <USelect v-model="userEditForm.role" :items="roleOptions" class="w-full" />
          </UFormField>
          <UFormField name="emailVerifiedEdit">
            <template #label>Email verified</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Email verified</p>
                    <p class="text-xs text-zinc-200">OIDC accounts auto-link to existing users only when the local account is verified.</p>
                  </div>
                </template>
              </UPopover></template>
            <USwitch v-model="userEditForm.emailVerified" label="Email is verified" />
          </UFormField>
          <div class="flex items-end justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="userEditOpen = false" />
            <UButton type="submit" icon="i-lucide-check" :loading="busy" label="Save changes" />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- password reset modal -->
    <UModal v-model:open="pwModalOpen" title="Reset password" description="Set a new password for this user">
      <template #body>
        <UForm :state="pwModal" class="space-y-4" @submit="submitPasswordReset">
          <UFormField label="New password" name="password" help="Minimum 8 characters">
            <UInput v-model="pwModal.password" type="password" icon="i-lucide-lock" class="w-full" required />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" label="Cancel" @click="pwModalOpen = false" />
            <UButton type="submit" :loading="busy" label="Set password" />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- delete confirm modal -->
    <UModal v-model:open="deleteModalOpen" title="Delete user" :description="deleteModal.what">
      <template #body>
        <p class="text-sm text-zinc-500">This action cannot be undone.</p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="deleteModalOpen = false" />
          <UButton color="error" icon="i-lucide-trash-2" label="Delete" @click="confirmDelete" />
        </div>
      </template>
    </UModal>

    <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <UTable :data="users" :columns="userColumns">
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
            <span v-if="row.original.hasPassword" class="flex items-center gap-1" title="Has a password login"><UIcon name="i-lucide-lock" class="size-3" />password</span>
            <span v-if="row.original.oidcLinked" class="flex items-center gap-1" title="Linked to OIDC"><UIcon name="i-lucide-key-round" class="size-3" />oidc</span>
            <span class="flex items-center gap-1" title="Active sessions"><UIcon name="i-lucide-monitor-smartphone" class="size-3" />{{ row.original.sessionCount }}</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit user" :disabled="!can('users', 'update')" @click="openUserEditor(row.original)" />
            <UButton icon="i-lucide-key-round" variant="ghost" color="neutral" size="sm" aria-label="Reset password" @click="resetPassword(row.original)" />
            <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Delete user" :disabled="Boolean(session?.user?.id && row.original.id === session.user.id)" @click="removeUser(row.original)" />
          </div>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin' })
const { session, can } = await useAdminSession()
const toast = useToast()
const busy = ref(false)

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
  { id: 'actions', header: '' },
]

const users = ref<AdminUser[]>([])
const roles = ref<{ id: string, name: string }[]>([])
const roleOptions = computed(() => roles.value.map(r => ({ label: r.name, value: r.name })))

onMounted(async () => {
  await refresh()
})

async function refresh() {
  try {
    const client = useNuxtApp().$client
    const [u, r] = await Promise.all([
      client.users.list(),
      can('roles', 'read') ? client.roles.list().then(r => ({ roles: r.roles as { id: string, name: string }[] })).catch(() => ({ roles: [] as { id: string, name: string }[] })) : Promise.resolve({ roles: [] as { id: string, name: string }[] }),
    ])
    users.value = u.users as AdminUser[]
    roles.value = r.roles
  }
  catch { /* ignore */ }
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
    await useNuxtApp().$client.users.update({ id: userEditForm.id, ...body })
    await refresh()
    userEditOpen.value = false
    toast.add({ title: 'User updated', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Update failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function addUser() {
  busy.value = true
  try {
    const body: Record<string, string | boolean> = { email: newUser.email.trim(), name: newUser.name.trim(), password: newUser.password, emailVerified: newUser.emailVerified }
    if (can('roles', 'update')) body.role = newUser.role
    await useNuxtApp().$client.users.save(body as { email: string, name: string, password: string, emailVerified: boolean, role?: string })
    newUser.email = ''
    newUser.name = ''
    newUser.password = ''
    newUser.role = 'viewer'
    showAddUser.value = false
    await refresh()
    toast.add({ title: 'User created', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
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
    await useNuxtApp().$client.users.setPassword({ id: pwModal.userId, password: pwModal.password })
    pwModalOpen.value = false
    toast.add({ title: `Password updated for ${pwModal.email}`, color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Reset failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

const deleteModalOpen = ref(false)
const deleteModal = reactive({ what: '', id: '' })

function removeUser(u: AdminUser) {
  deleteModal.what = `user ${u.email} and all their sessions`
  deleteModal.id = u.id
  deleteModalOpen.value = true
}

async function confirmDelete() {
  try {
    await useNuxtApp().$client.users.remove({ id: deleteModal.id })
    await refresh()
    toast.add({ title: 'User deleted', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  deleteModalOpen.value = false
}
</script>
