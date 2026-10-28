<template>
  <div class="space-y-6">
    <PageHeader title="Routes">
      <template #subtitle>
        Route incoming paths to upstream origins<template v-if="routesLive.data"><span class="inline-flex items-center gap-1"> · <span class="relative flex size-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" /><span class="relative inline-flex size-1.5 rounded-full bg-emerald-500" /></span>live</span></template>
      </template>
      <template #actions>
        <UButton v-if="can('routes', 'create')" icon="i-lucide-plus" label="New route" @click="openEditor()" />
      </template>
    </PageHeader>

    <!-- editor modal -->
    <FormModal
      :open="!!editing" :title="editing === 'new' ? 'Create route' : `Edit ${editing}`"
      content-class="max-w-xl" :form-id="routeFormId"
      :submit-label="editing === 'new' ? 'Add route' : 'Save changes'" submit-icon="i-lucide-check" :busy="busy"
      @update:open="(v: boolean) => !v && reset()"
    >
      <UForm :id="routeFormId" :state="form" :validate="validatePair" class="grid gap-5 sm:grid-cols-2" @submit="save">
        <UFormField name="path">
          <template #label>Path</template>
          <template #hint>
            <FieldHint title="Path" example="e.g. /hook, /hook/*, /">
              The incoming request path this route claims. Exact paths match only themselves. End with <code>/*</code> to match everything beneath.
            </FieldHint>
          </template>
          <UInput v-model="form.path" placeholder="/hook or /hook/*" icon="i-lucide-slash" class="w-full" />
          <template #help><span>{{ pathHelp }}</span></template>
        </UFormField>
        <UFormField name="target">
          <template #label>Target origin</template>
          <template #hint>
            <FieldHint title="Target origin" example="e.g. https://api.example.com">
              Absolute http(s) URL of the upstream. Exact routes forward to this URL verbatim; wildcard routes treat a path here as the prefix of the forwarded remainder. No query or fragment.
            </FieldHint>
          </template>
          <UInput v-model="form.target" placeholder="https://api.example.com" icon="i-lucide-globe" class="w-full" />
        </UFormField>
        <UFormField name="requestHeaders" class="sm:col-span-2">
          <template #label>Request headers</template>
          <template #hint>
            <FieldHint title="Request headers" example="e.g. host = api.example.com · authorization = Bearer …">
              Set or strip headers on the request before it reaches the upstream. <code>set</code> replaces the client's value (or adds it); <code>remove</code> strips it. The Host header can be set here — some upstreams (CDNs, SNI routers) need a specific value.
            </FieldHint>
          </template>
          <HeaderRowsEditor v-model="form.requestHeaders" />
        </UFormField>
        <UFormField name="responseHeaders" class="sm:col-span-2">
          <template #label>Response headers</template>
          <template #hint>
            <FieldHint title="Response headers" example="e.g. cache-control = public, max-age=60">
              Set or strip headers on the proxied response before it reaches the client. Useful for CORS, cache-control or security headers; also removes upstream fingerprints like <code>x-powered-by</code>.
            </FieldHint>
          </template>
          <HeaderRowsEditor v-model="form.responseHeaders" />
        </UFormField>
        <UFormField name="note">
          <template #label>Note</template>
          <template #hint>
            <FieldHint title="Note" example="e.g. webhooks from partner X">
              Free-form reminder of what this route is for — shown only in this admin list.
            </FieldHint>
          </template>
          <UInput v-model="form.note" placeholder="webhooks from partner X" icon="i-lucide-notebook-pen" class="w-full" />
        </UFormField>
        <UFormField name="methods">
          <template #label>Allowed methods</template>
          <template #hint>
            <FieldHint title="Allowed methods">
              Only the selected HTTP verbs are forwarded; anything else gets 405. Leave "All" on to forward everything.
            </FieldHint>
          </template>
          <div class="flex flex-wrap items-center gap-2">
            <UCheckbox v-model="form.methodsAll" label="All" @update:model-value="() => { if (form.methodsAll) form.methods = [] }" />
            <template v-for="verb in allVerbs" :key="verb">
              <button
                type="button"
                :disabled="form.methodsAll"
                :aria-pressed="form.methods.includes(verb)"
                class="min-h-8 rounded-md border px-2 py-1 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
                :class="form.methods.includes(verb)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-600 dark:text-zinc-400'"
                @click="toggleVerb(verb)"
              >
                {{ verb }}
              </button>
            </template>
          </div>
        </UFormField>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3 sm:col-span-2">
          <USwitch v-model="form.enabled" label="Enabled" />
        </div>
      </UForm>
    </FormModal>

    <UCard v-if="routes.length" :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <UTable :data="routes" :columns="routeColumns">
        <template #path-cell="{ row }">
          <div class="flex items-center gap-2">
            <code class="rounded-md bg-primary/5 px-1.5 py-0.5 text-sm font-semibold text-primary">{{ row.original.path }}</code>
            <UBadge v-if="!row.original.enabled" label="disabled" variant="subtle" color="neutral" size="sm" />
          </div>
        </template>
        <template #target-cell="{ row }">
          <div class="text-xs text-zinc-500">
            <span class="break-all font-mono">{{ row.original.target }}</span>
            <span v-if="row.original.methods?.length" class="block font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{{ row.original.methods.join(' ') }}</span>
            <span v-if="row.original.note" class="block truncate text-zinc-500 dark:text-zinc-400">{{ row.original.note }}</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-2">
            <IconButton v-if="can('logs', 'read')" text="Route logs" icon="i-lucide-chart-line" @click="viewRouteLogs(row.original)" />
            <IconButton v-if="can('routes', 'update')" text="Edit route" icon="i-lucide-pencil" @click="edit(row.original)" />
            <IconButton v-if="can('routes', 'delete')" text="Delete route" icon="i-lucide-trash-2" color="error" @click="remove(row.original)" />
          </div>
        </template>
      </UTable>
    </UCard>
    <EmptyState v-else-if="routesList.isPending.value" loading icon="i-lucide-route" title="Loading routes…" />
    <EmptyState v-else icon="i-lucide-route" title="No routes yet" description="Create a route to start forwarding requests">
      <UButton v-if="can('routes', 'create')" class="mt-4" icon="i-lucide-plus" label="Create your first route" @click="openEditor()" />
    </EmptyState>

    <!-- delete confirm modal -->
    <ConfirmModal v-model:open="deleteModalOpen" title="Delete route" :description="deleteModal.what" :busy="deleteBusy" @confirm="confirmDelete" />
  </div>
</template>

<script setup lang="ts">

useHead({ title: 'Routes' })
import type { TableColumn } from '@nuxt/ui'
import type { RouteRow } from '~/../shared/types'
import { routeSubmitSchema, type HeaderRowInput } from '~/utils/route-form'
import { useQuery } from '@tanstack/vue-query'
import { onServerPrefetch } from 'vue'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const toast = useToast()
const { $orpc, $client } = useNuxtApp()

// ---------- routes: conventional query loads the list (SSR + first paint);
// the SSE live query only updates it afterwards (AGENTS.md law: streams never
// carry initial data) ----------
const routesList = useQuery($orpc.routes.list.queryOptions())
// SSR: await the conventional query so the server HTML carries the rows
// (hydration transfers them; the client does not refetch while fresh)
onServerPrefetch(async () => {
  if (can('routes', 'read')) await routesList.suspense()
})
const routesLive = useQuery({
  ...$orpc.routes.live.liveOptions(),
  enabled: computed(() => import.meta.client),
})
// once the stream has delivered (reconciliation frame or a change push), it is
// strictly fresher than the one-shot list — until then paint the get-query data
const routes = computed(() =>
  ((unref(routesLive.data) ?? unref(routesList.data)) ?? []) as RouteRow[])

const routeColumns: TableColumn<RouteRow>[] = [
  { accessorKey: 'path', header: 'Path' },
  { accessorKey: 'target', header: 'Target' },
  { id: 'actions', header: 'Actions', meta: { class: { th: 'sr-only' } } },
]

// ---------- route form ----------
const allVerbs = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
const emptyForm = () => ({ id: undefined as number | undefined, path: '', target: '', requestHeaders: [] as HeaderRowInput[], responseHeaders: [] as HeaderRowInput[], note: undefined as string | undefined, methodsAll: true, methods: [] as string[], enabled: true })
const form = reactive(emptyForm())
const busy = ref(false)
const editing = ref('')
const routeFormId = useId()

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
  // populate-then-open: the modal must never flash stale form state
  // toRaw: live-query rows are reactive Proxies — structuredClone rejects them
  Object.assign(form, structuredClone(toRaw(p)))
  form.id = p.id
  form.methodsAll = !p.methods || p.methods.length === 0
  form.methods = p.methods ? [...p.methods] : []
  form.requestHeaders = (p.requestHeaders ?? []).map(o => ({ name: o.name, op: o.op, value: o.value ?? '' }))
  form.responseHeaders = (p.responseHeaders ?? []).map(o => ({ name: o.name, op: o.op, value: o.value ?? '' }))
  editing.value = p.path
}

function reset() {
  editing.value = ''
  Object.assign(form, emptyForm())
}

async function save() {
  busy.value = true
  try {
    const parsed = routeSubmitSchema.safeParse({ ...form })
    if (!parsed.success) {
      toast.add({ title: 'Check the form', description: parsed.error.issues[0]?.message, color: 'error' })
      busy.value = false
      return
    }
    if (!form.methodsAll && form.methods.length === 0) {
      toast.add({ title: 'Select at least one method', description: 'Unchecking All with no verbs would save a route that forwards everything', color: 'error' })
      busy.value = false
      return
    }
    await $client.routes.save({
      ...parsed.data,
      id: editing.value && editing.value !== 'new' ? form.id : undefined,
      methods: (form.methodsAll ? undefined : form.methods) as Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'> | undefined,
    })
    toast.add({ title: editing.value && editing.value !== 'new' ? 'Route updated' : 'Route added', color: 'success' })
    reset()
  }
  catch (e: unknown) {
    toast.add({ title: 'Save failed', description: errorMessage(e), color: 'error' })
  }
  busy.value = false
}

// ---------- delete ----------
const deleteModalOpen = ref(false)
const deleteBusy = ref(false)
const deleteModal = reactive({ what: '', routePath: '' })

function remove(p: RouteRow) {
  deleteModal.what = `${p.path} → ${p.target}`
  deleteModal.routePath = p.path
  deleteModalOpen.value = true
}

async function confirmDelete() {
  deleteBusy.value = true
  try {
    await $client.routes.remove({ path: deleteModal.routePath })
    if (editing.value === deleteModal.routePath) reset()
    toast.add({ title: 'Route deleted', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Delete failed', description: errorMessage(e), color: 'error' })
  }
  deleteBusy.value = false
  deleteModalOpen.value = false
}

function viewRouteLogs(p: RouteRow) {
  navigateTo({ path: '/admin/logs', query: { routeId: String(p.id), path: p.path } })
}
</script>
