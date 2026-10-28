<template>
  <div class="space-y-6">
    <PageHeader title="Access log">
      <template #subtitle>
        <template v-if="filterPath">Filtered by route <code class="rounded bg-primary/5 px-1 py-0.5 font-mono text-xs text-primary">{{ filterPath }}</code></template>
        <template v-else>All forwarded traffic</template>
        <template v-if="!filterPath">
          <span v-if="liveEnabled" class="inline-flex items-center gap-1">· <span class="relative flex size-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" /><span class="relative inline-flex size-1.5 rounded-full bg-emerald-500" /></span>live tail</span>
          <span v-else class="inline-flex items-center gap-1">· <span class="inline-flex size-1.5 rounded-full bg-zinc-400" /><span class="text-zinc-500 dark:text-zinc-400">paused</span></span>
        </template>
      </template>
      <template #actions>
        <UButton v-if="filterPath" variant="outline" color="neutral" icon="i-lucide-x" label="Clear filter" @click="clearFilter" />
        <USwitch v-model="liveEnabled" size="sm" label="Live" :disabled="Boolean(filterPath)" />
        <UButton icon="i-lucide-refresh-cw" variant="outline" color="neutral" label="Refresh" :loading="logsSnapshot.isFetching.value" @click="logsSnapshot.refetch()" />
      </template>
    </PageHeader>

    <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
      <div v-if="entries.length" class="overflow-x-auto" style="-webkit-overflow-scrolling: touch">
        <UTable :data="entries" :columns="logColumns">
          <template #ts-cell="{ row }">
            <span class="whitespace-nowrap font-mono text-xs text-zinc-500">{{ fmtTime(row.original.ts) }}</span>
          </template>
          <template #method-cell="{ row }">
            <span class="font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-300">{{ row.original.method }}</span>
          </template>
          <template #path-cell="{ row }">
            <span class="block max-w-72 truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">{{ row.original.path }}</span>
          </template>
          <template #routePath-cell="{ row }">
            <span v-if="row.original.routePath" class="rounded bg-primary/5 px-1.5 py-0.5 font-mono text-xs text-primary">{{ row.original.routePath }}</span>
          </template>
          <template #status-cell="{ row }">
            <span class="rounded px-1.5 py-0.5 font-mono text-xs font-semibold" :class="statusClass(row.original.status)">{{ row.original.status }}</span>
          </template>
          <template #durationMs-cell="{ row }">
            <span class="whitespace-nowrap font-mono text-xs text-zinc-500">{{ row.original.durationMs }}ms</span>
          </template>
          <template #clientIp-cell="{ row }">
            <span class="whitespace-nowrap font-mono text-xs text-zinc-500 dark:text-zinc-400">{{ row.original.clientIp || '—' }}</span>
          </template>
        </UTable>
      </div>
      <EmptyState v-else-if="!can('logs', 'read')" icon="i-lucide-shield-x" title="No access to logs" description="You don't have permission to view logs — ask an admin for access" :dashed="false" />
      <EmptyState v-else-if="logsSnapshot.isPending.value" icon="i-lucide-scroll-text" title="Loading logs…" :loading="true" :dashed="false" />
      <EmptyState v-else-if="filterLoadError" icon="i-lucide-triangle-alert" title="Failed to load" description="The query failed — use Refresh to retry" :dashed="false" />
      <EmptyState v-else icon="i-lucide-scroll-text" title="No traffic logged" :description="filterPath ? `Requests forwarded to ${filterPath} will appear here` : 'Requests forwarded by routes appear here in real time'" :dashed="false" />
      <div v-if="entries.length >= pageSize && hasMore" class="flex justify-center border-t border-zinc-100 py-3 dark:border-zinc-800/60">
        <UButton variant="soft" color="neutral" size="sm" label="Load more" :loading="olderBusy" @click="loadMore" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">

useHead({ title: 'Access log' })
import type { TableColumn } from '@nuxt/ui'
import { useQuery } from '@tanstack/vue-query'
import { onServerPrefetch } from 'vue'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const toast = useToast()
const { $orpc, $client } = useNuxtApp()
const route = useRoute()

const pageSize = 50
const rawRouteId = route.query.routeId ? Number(route.query.routeId) : null
const filterRouteId = ref<number | null>(rawRouteId !== null && Number.isInteger(rawRouteId) && rawRouteId > 0 ? rawRouteId : null)
const filterPath = ref<string | null>(route.query.path ? String(route.query.path) : null)

interface LogRow { id: number, ts: string, routeId: number | null, routePath: string | null, method: string, path: string, status: number, durationMs: number, clientIp: string | null, userAgent: string | null }
const logColumns: TableColumn<LogRow>[] = [
  { accessorKey: 'ts', header: 'Time' },
  { accessorKey: 'method', header: 'Method' },
  { accessorKey: 'path', header: 'Path' },
  { accessorKey: 'routePath', header: 'Route' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'durationMs', header: 'Duration' },
  { accessorKey: 'clientIp', header: 'Client' },
]

// live tail: plain snapshot query for the initial data (SSR-safe — subscribing
// to the SSE stream during SSR deadlocks behind buffering proxies like nginx,
// leaving the page on an eternal spinner), then the live query takes over on
// the client and streams every new entry. "Load more" in unfiltered mode
// pauses the tail and pages history with a beforeId cursor (browsing history
// older than the tail window); a reload/clear-filter resumes the live tail.
const logsSnapshot = useQuery({
  ...$orpc.logs.recent.queryOptions({ input: { limit: pageSize } }),
  enabled: computed(() => can('logs', 'read')),
})
// SSR: await ONLY the conventional snapshot (never the SSE tail — a stream
// during server render deadlocks behind buffering proxies). The guide's
// caveat applies: a disabled query never resolves, so guard first.
onServerPrefetch(async () => {
  if (can('logs', 'read')) await logsSnapshot.suspense()
})
// merged live list: deltas from the SSE tail PREPEND and the oldest rows fall off
// the bottom so the list stays at whatever the user has loaded (50 by default,
// +50 per Load more). Load more cursor-pages BELOW the visible window with
// logs.recent — and the live tail KEEPS RUNNING while paging (one list, one rule:
// newest on top, oldest evicted, no mode switch, no Resume button).
const liveEnabled = ref(true)
const logsLive = useQuery({
  ...$orpc.logs.tail.liveOptions(),
  enabled: computed(() => import.meta.client && liveEnabled.value && can('logs', 'read') && filterRouteId.value === null),
})
const merged = ref<LogRow[]>([])
const seen = ref(new Set<number>())
// how many rows the merged list may hold: window + everything Load more added
const loaded = ref(1) // in pages: 1 = the initial window
const maxKeep = computed(() => pageSize * loaded.value)

// single write path — always caps and re-syncs the seen-set (concurrent deltas
// and Load-more appends must interleave through ONE mutator, never stale spreads)
function applyRows(rows: LogRow[], mode: 'reset' | 'prepend' | 'append') {
  const next = mode === 'reset'
    ? rows.slice()
    : mode === 'prepend'
      ? [...rows.filter(e => !seen.value.has(e.id)), ...merged.value]
      : [...merged.value, ...rows.filter(e => !seen.value.has(e.id))]
  merged.value = next.slice(0, maxKeep.value)
  seen.value = new Set(merged.value.map(e => e.id))
}

// the conventional query owns initial data: seed (and Refresh-replace) the merged
// list when the snapshot lands; the tail then only PREPENDS deltas on top
watch(() => unref(logsSnapshot.data), (d) => {
  const entries = (d as { entries: LogRow[] } | undefined)?.entries
  if (!entries) return
  applyRows(entries, 'reset')
}, { immediate: true })

// the tail carries only rows newer than its subscribe-time cursor — every payload
// is a prepend. If the stream drops, the snapshot refetch reconciles the gap.
watch(() => unref(logsLive.data), (d) => {
  const payload = d as { entries: LogRow[] } | undefined
  if (!payload?.entries) return
  if (!liveEnabled.value && merged.value.length) return // paused: freeze
  applyRows(payload.entries, 'prepend')
})
watch(() => unref(logsLive.error), (err) => {
  if (err && liveEnabled.value && can('logs', 'read')) void logsSnapshot.refetch()
})

const liveEntries = computed(() => {
  if (merged.value.length) return merged.value
  return ((unref(logsSnapshot.data) as { entries: LogRow[] } | undefined)?.entries ?? []) as LogRow[]
})

// filter mode stays a paged, non-live list over one route
const older = ref<LogRow[]>([])
const olderBusy = ref(false)
const olderError = ref(false)
const filterLoadError = computed(() => olderError.value && Boolean(filterRouteId.value))
const hasMore = ref(true)
const entries = computed(() => {
  if (filterRouteId.value) return older.value
  return liveEntries.value
})

watch(filterRouteId, loadFiltered, { immediate: true })

async function loadFiltered() {
  if (!filterRouteId.value) { older.value = []; olderError.value = false; return }
  olderBusy.value = true
  olderError.value = false
  try {
    const r = await $client.logs.recent({ limit: pageSize, routeId: filterRouteId.value ?? undefined })
    older.value = r.entries as LogRow[]
  }
  catch {
    older.value = []
    olderError.value = true
  }
  olderBusy.value = false
}

async function loadMore() {
  if (olderBusy.value) return
  olderBusy.value = true
  try {
    if (filterRouteId.value) {
      const list = older.value
      const beforeCursor = list.length ? list.at(-1)!.id : undefined
      const r = await $client.logs.recent({ limit: pageSize, routeId: filterRouteId.value, beforeId: beforeCursor })
      older.value = [...older.value, ...r.entries as LogRow[]]
      hasMore.value = r.entries.length === pageSize
      return
    }
    // seed from whatever is visible if the tail hasn't delivered yet
    if (!merged.value.length) merged.value = [...liveEntries.value]
    const beforeCursor = merged.value.length ? merged.value.at(-1)!.id : undefined
    const r = await $client.logs.recent({ limit: pageSize, beforeId: beforeCursor })
    loaded.value++ // raise the cap BEFORE appending so history is never evicted by the append itself
    applyRows(r.entries as LogRow[], 'append')
    hasMore.value = r.entries.length === pageSize
  }
  catch (e: unknown) {
    toast.add({ title: 'Failed to load more', description: errorMessage(e), color: 'error' })
  }
  finally { olderBusy.value = false }
}

function clearFilter() {
  filterRouteId.value = null
  filterPath.value = null
  navigateTo({ path: '/admin/logs', query: {} })
}

function statusClass(status: number): string {
  if (status >= 500) return 'bg-red-500/10 text-red-700 dark:text-red-400'
  if (status >= 400) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
  return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
}

function fmtTime(iso: string): string {
  // deterministic UTC from the stored ISO string — no Date getters, so SSR and
  // hydration render byte-identical output in every timezone (a local-time
  // format here re-renders the whole table on hydration when TZs differ)
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}
</script>
