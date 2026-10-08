<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Routes</h2>
        <p class="text-sm text-zinc-500">Route incoming paths to upstream origins · <span class="inline-flex items-center gap-1"><span class="relative flex size-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span class="relative inline-flex size-1.5 rounded-full bg-emerald-500" /></span>live</span></p>
      </div>
      <UButton v-if="can('routes', 'create')" icon="i-lucide-plus" label="New route" class="self-end sm:self-auto" @click="openEditor()" />
    </div>

    <!-- editor modal -->
    <UModal :open="!!editing" :title="editing === 'new' ? 'Create route' : `Edit ${editing}`" :ui="{ content: 'max-w-xl' }" @update:open="(v: boolean) => !v && reset()">
      <template #body>
        <UForm :state="form" :validate="validatePair" class="grid gap-5 sm:grid-cols-2" @submit="save">
          <UFormField name="path">
            <template #label>Path</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
              <template #default>
                <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
              </template>
              <template #content>
                <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                  <p class="text-xs font-semibold text-white">Path</p>
                  <p class="text-xs text-zinc-200">The incoming request path this route claims. Exact paths match only themselves. End with <code>/*</code> to match everything beneath.</p>
                  <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. /hook, /hook/*, /</p>
                </div>
              </template>
            </UPopover></template>
            <UInput v-model="form.path" placeholder="/hook or /hook/*" icon="i-lucide-slash" class="w-full" />
            <template #help><span>{{ pathHelp }}</span></template>
          </UFormField>
          <UFormField name="target">
            <template #label>Target origin</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
              <template #default>
                <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
              </template>
              <template #content>
                <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                  <p class="text-xs font-semibold text-white">Target origin</p>
                  <p class="text-xs text-zinc-200">Absolute http(s) URL of the upstream. A path here becomes a prefix on every forwarded request. No query or fragment.</p>
                  <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. https://api.example.com</p>
                </div>
              </template>
            </UPopover></template>
            <UInput v-model="form.target" placeholder="https://api.example.com" icon="i-lucide-globe" class="w-full" />
          </UFormField>
          <UFormField name="requestHeaders" class="sm:col-span-2">
            <template #label>Request headers</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
              <template #default>
                <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
              </template>
              <template #content>
                <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                  <p class="text-xs font-semibold text-white">Request headers</p>
                  <p class="text-xs text-zinc-200">Set or strip headers on the request before it reaches the upstream. <code>set</code> replaces the client's value (or adds it); <code>remove</code> strips it. The Host header can be set here — some upstreams (CDNs, SNI routers) need a specific value.</p>
                  <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. host = api.example.com · authorization = Bearer …</p>
                </div>
              </template>
            </UPopover></template>
            <HeaderRowsEditor v-model="form.requestHeaders" />
          </UFormField>
          <UFormField name="responseHeaders" class="sm:col-span-2">
            <template #label>Response headers</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
              <template #default>
                <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
              </template>
              <template #content>
                <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                  <p class="text-xs font-semibold text-white">Response headers</p>
                  <p class="text-xs text-zinc-200">Set or strip headers on the proxied response before it reaches the client. Useful for CORS, cache-control or security headers; also removes upstream fingerprints like <code>x-powered-by</code>.</p>
                  <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. cache-control = public, max-age=60</p>
                </div>
              </template>
            </UPopover></template>
            <HeaderRowsEditor v-model="form.responseHeaders" />
          </UFormField>
          <UFormField name="note">
            <template #label>Note</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
              <template #default>
                <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
              </template>
              <template #content>
                <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                  <p class="text-xs font-semibold text-white">Note</p>
                  <p class="text-xs text-zinc-200">Free-form reminder of what this route is for — shown only in this admin list.</p>
                  <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. webhooks from partner X</p>
                </div>
              </template>
            </UPopover></template>
            <UInput v-model="form.note" placeholder="webhooks from partner X" icon="i-lucide-notebook-pen" class="w-full" />
          </UFormField>
          <UFormField name="methods">
            <template #label>Allowed methods</template>
            <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Allowed methods</p>
                    <p class="text-xs text-zinc-200">Only the selected HTTP verbs are forwarded; anything else gets 405. Leave "All" on to forward everything.</p>
                  </div>
                </template>
              </UPopover></template>
            <div class="flex flex-wrap items-center gap-2">
              <UCheckbox v-model="form.methodsAll" label="All" @update:model-value="() => { if (form.methodsAll) form.methods = [] }" />
              <template v-for="verb in allVerbs" :key="verb">
                <button
                  type="button"
                  :disabled="form.methodsAll"
                  class="rounded-md border px-2 py-1 font-mono text-xs transition-colors disabled:opacity-40"
                  :class="form.methods.includes(verb)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-600'"
                  @click="toggleVerb(verb)"
                >
                  {{ verb }}
                </button>
              </template>
            </div>
          </UFormField>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-3 sm:col-span-2">
            <div class="flex items-center gap-1.5">
              <USwitch v-model="form.stripPrefix" :disabled="!isWildcard" label="Strip prefix" />
              <UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                <template #default>
                  <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                </template>
                <template #content>
                  <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                    <p class="text-xs font-semibold text-white">Strip prefix</p>
                    <p class="text-xs text-zinc-200">Remove the route’s base path before forwarding, so <code>/hook/x</code> arrives upstream as <code>/x</code>. Wildcard routes only.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. /hook/* + strip → upstream sees /x</p>
                  </div>
                </template>
              </UPopover>
            </div>
            <USwitch v-model="form.enabled" label="Enabled" />
          </div>
          <div class="flex justify-end gap-2 sm:col-span-2">
            <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="reset" />
            <UButton type="submit" :loading="busy" :label="editing === 'new' ? 'Add route' : 'Save changes'" />
          </div>
        </UForm>
      </template>
    </UModal>

    <UCard v-if="routes.length" :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <UTable :data="routes" :columns="routeColumns">
        <template #path-cell="{ row }">
          <div class="flex items-center gap-2">
            <code class="rounded-md bg-primary/5 px-1.5 py-0.5 text-sm font-semibold text-primary">{{ row.original.path }}</code>
            <UBadge v-if="row.original.stripPrefix" label="strip" variant="subtle" color="warning" size="sm" />
            <UBadge v-if="!row.original.enabled" label="disabled" variant="subtle" color="error" size="sm" />
          </div>
        </template>
        <template #target-cell="{ row }">
          <div class="text-xs text-zinc-500">
            <span class="break-all font-mono">{{ row.original.target }}</span>
            <span v-if="row.original.methods?.length" class="block font-mono text-[10px] text-zinc-400">{{ row.original.methods.join(' ') }}</span>
            <span v-if="row.original.note" class="block truncate text-zinc-400">{{ row.original.note }}</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <UButton v-if="can('logs', 'read')" icon="i-lucide-chart-line" variant="ghost" color="neutral" size="sm" aria-label="Route logs" @click="viewRouteLogs(row.original)" />
            <UButton v-if="can('routes', 'update')" icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit route" @click="edit(row.original)" />
            <UButton v-if="can('routes', 'delete')" icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Delete route" @click="remove(row.original)" />
          </div>
        </template>
      </UTable>
    </UCard>
    <div v-else-if="routesQuery.isPending.value" class="rounded-xl border border-zinc-200 p-10 text-center dark:border-zinc-800">
      <UIcon name="i-lucide-loader-circle" class="mx-auto size-8 animate-spin text-zinc-300" />
      <p class="mt-3 text-sm text-zinc-500">Loading routes…</p>
    </div>
    <div v-else class="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <UIcon name="i-lucide-route" class="mx-auto size-8 text-zinc-300" />
      <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No routes yet</p>
      <p class="mt-1 text-xs text-zinc-500">Create a route to start forwarding requests</p>
      <UButton v-if="can('routes', 'create')" class="mt-4" icon="i-lucide-plus" label="Create your first route" @click="openEditor()" />
    </div>

    <!-- delete confirm modal -->
    <UModal v-model:open="deleteModalOpen" title="Delete route" :description="deleteModal.what">
      <template #body>
        <p class="text-sm text-zinc-500">This action cannot be undone.</p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="deleteModalOpen = false" />
          <UButton color="error" icon="i-lucide-trash-2" label="Delete" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { RouteRow, RoutesResponse } from '~/../shared/types'
import { routeSubmitSchema, type HeaderRowInput } from '~/utils/route-form'
import { useQuery } from '@tanstack/vue-query'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const toast = useToast()
const { $orpc } = useNuxtApp()

// ---------- realtime routes via oRPC live query ----------
const routesQuery = useQuery(($orpc as any).routes.live.liveOptions())
const routes = computed(() => (unref(routesQuery.data) ?? []) as RouteRow[])
// live queries need no invalidation — but mutations via REST should also refresh cache
// (SSE pushes handle it; this is belt-and-braces for offline SSE)

const routeColumns: TableColumn<RouteRow>[] = [
  { accessorKey: 'path', header: 'Path' },
  { accessorKey: 'target', header: 'Target' },
  { id: 'actions', header: '' },
]

// ---------- route form ----------
const allVerbs = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
const emptyForm = () => ({ id: undefined as number | undefined, path: '', target: '', requestHeaders: [] as HeaderRowInput[], responseHeaders: [] as HeaderRowInput[], note: undefined as string | undefined, stripPrefix: false, methodsAll: true, methods: [] as string[], enabled: true })
const form = reactive(emptyForm())
const busy = ref(false)
const editing = ref('')

function toggleVerb(v: string) {
  const i = form.methods.indexOf(v)
  if (i >= 0) form.methods.splice(i, 1)
  else form.methods.push(v)
}

const isWildcard = computed(() => form.path.trim().endsWith('/*') || form.path.trim() === '/')
const pathHelp = computed(() => isWildcard.value ? 'Wildcard — matches this path and everything under it' : 'Exact match — this path only. Add /* for a subtree')

function openEditor() {
  editing.value = 'new'
}

function validatePair(state: typeof form): Array<{ name: string, message: string }> {
  const result = routeSubmitSchema.safeParse(state)
  if (result.success) return []
  return result.error.issues
    .filter(i => i.path.length > 0)
    .map(i => ({ name: String(i.path[0]), message: i.message }))
}

function edit(p: RouteRow) {
  editing.value = p.path
  Object.assign(form, JSON.parse(JSON.stringify(p)))
  form.id = p.id
  form.methodsAll = !p.methods || p.methods.length === 0
  form.methods = p.methods ? [...p.methods] : []
  form.requestHeaders = (p.requestHeaders ?? []).map(o => ({ name: o.name, op: o.op, value: o.value ?? '' }))
  form.responseHeaders = (p.responseHeaders ?? []).map(o => ({ name: o.name, op: o.op, value: o.value ?? '' }))
}

function reset() {
  editing.value = ''
  Object.assign(form, emptyForm())
}

watch(isWildcard, (w) => {
  if (!w && form.stripPrefix) form.stripPrefix = false
})

async function save() {
  busy.value = true
  try {
    const parsed = routeSubmitSchema.safeParse({ ...form })
    if (!parsed.success) {
      toast.add({ title: 'Check the form', description: parsed.error.issues[0]?.message, color: 'error' })
      busy.value = false
      return
    }
    await $fetch<RoutesResponse>('/api/routes', {
      method: 'PUT',
      body: {
        ...parsed.data,
        id: editing.value && editing.value !== 'new' ? form.id : undefined,
        methods: form.methodsAll || form.methods.length === 0 ? undefined : form.methods,
      },
    })
    toast.add({ title: editing.value && editing.value !== 'new' ? 'Route updated' : 'Route added', color: 'success' })
    reset()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

// ---------- delete ----------
const deleteModalOpen = ref(false)
const deleteModal = reactive({ what: '', routePath: '' })

function remove(p: RouteRow) {
  deleteModal.what = `${p.path} → ${p.target}`
  deleteModal.routePath = p.path
  deleteModalOpen.value = true
}

async function confirmDelete() {
  try {
    await $fetch(`/api/routes/${encodeURIComponent(deleteModal.routePath)}`, { method: 'DELETE' })
    if (editing.value === deleteModal.routePath) reset()
    toast.add({ title: 'Route deleted', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  deleteModalOpen.value = false
}

function viewRouteLogs(p: RouteRow) {
  navigateTo({ path: '/admin/logs', query: { routeId: String(p.id), path: p.path } })
}
</script>
