<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Access log</h2>
        <p class="text-sm text-zinc-500">
          <template v-if="filterPath">Filtered by route <code class="rounded bg-primary/5 px-1 py-0.5 font-mono text-xs text-primary">{{ filterPath }}</code></template>
          <template v-else>All forwarded traffic</template>
          · <span class="inline-flex items-center gap-1"><span class="relative flex size-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span class="relative inline-flex size-1.5 rounded-full bg-emerald-500" /></span>live tail</span>
        </p>
      </div>
      <div class="flex items-center gap-2 self-end sm:self-auto">
        <UButton v-if="filterPath" variant="outline" color="neutral" icon="i-lucide-x" label="Clear filter" @click="clearFilter" />
        <UButton icon="i-lucide-refresh-cw" variant="outline" color="neutral" label="Refresh" :loading="logsSnapshot.isFetching.value" @click="logsSnapshot.refetch()" />
      </div>
    </div>

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
            <span class="whitespace-nowrap font-mono text-xs text-zinc-400">{{ row.original.clientIp || '—' }}</span>
          </template>
        </UTable>
      </div>
      <div v-else-if="!can('logs', 'read')" class="p-10 text-center">
        <UIcon name="i-lucide-shield-x" class="mx-auto size-8 text-zinc-300" />
        <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No access to logs</p>
        <p class="mt-1 text-xs text-zinc-500">Your role does not include logs:read</p>
      </div>
      <div v-else-if="logsSnapshot.isPending.value" class="p-10 text-center">
        <UIcon name="i-lucide-loader-circle" class="mx-auto size-8 animate-spin text-zinc-300" />
        <p class="mt-3 text-sm text-zinc-500">Loading logs…</p>
      </div>
      <div v-else class="p-10 text-center">
        <UIcon name="i-lucide-scroll-text" class="mx-auto size-8 text-zinc-300" />
        <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ filterPath ? 'No traffic for this route yet' : 'No traffic logged' }}</p>
        <p class="mt-1 text-xs text-zinc-500">{{ filterPath ? `Requests forwarded to ${filterPath} will appear here in real time` : 'Requests forwarded by routes appear here in real time' }}</p>
      </div>
      <div v-if="entries.length >= pageSize && hasMore" class="flex justify-center border-t border-zinc-100 py-3 dark:border-zinc-800/60">
        <UButton variant="soft" color="neutral" size="sm" label="Load more" :loading="olderBusy" @click="loadMore" />
      </div>
      <div v-else-if="paging" class="flex justify-center border-t border-zinc-100 py-3 dark:border-zinc-800/60">
        <UButton variant="outline" color="neutral" size="sm" icon="i-lucide-radio" label="Resume live tail" @click="resumeLive" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { useQuery } from '@tanstack/vue-query'

definePageMeta({ layout: 'admin' })
const { can } = await useAdminSession()
const { $orpc } = useNuxtApp()
const route = useRoute()

const pageSize = 50
const filterRouteId = ref<number | null>(route.query.routeId ? Number(route.query.routeId) : null)
const filterPath = ref<string | null>(route.query.path ? String(route.query.path) : null)

interface LogRow { id: number, ts: string, routeId: number | null, routePath: string | null, method: string, path: string, status: number, durationMs: number, clientIp: string | null, userAgent: string | null }
const logColumns: TableColumn<LogRow>[] = [
  { accessorKey: 'ts', header: 'Time' },
  { accessorKey: 'method', header: 'Method' },
  { accessorKey: 'path', header: 'Path' },
  { accessorKey: 'routePath', header: 'Route' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'durationMs', header: 'Took' },
  { accessorKey: 'clientIp', header: 'Client' },
]

// live tail: plain snapshot query for the initial data (SSR-safe — subscribing
// to the SSE stream during SSR deadlocks behind buffering proxies like nginx,
// leaving the page on an eternal spinner), then the live query takes over on
// the client and streams every new entry. "Load more" in unfiltered mode
// pauses the tail and pages history with a beforeId cursor (browsing history
// older than the tail window); a reload/clear-filter resumes the live tail.
const logsSnapshot = useQuery({
  ...($orpc as any).logs.recent.queryOptions({ input: { limit: pageSize } }),
  enabled: computed(() => can('logs', 'read')),
})
// history-paging state — declared BEFORE logsLive: its enabled computed reads
// paging.value and vue-query evaluates options synchronously during SSR
// (use-before-declare = TDZ 500 on the server)
const paging = ref(false)
const paged = ref<LogRow[]>([])
const hasMore = ref(true)
const logsLive = useQuery({
  ...($orpc as any).logs.tail.liveOptions({ input: { limit: pageSize } }),
  enabled: computed(() => import.meta.client && can('logs', 'read') && filterRouteId.value === null && !paging.value),
})
const liveEntries = computed(() => {
  const live = (unref(logsLive.data) as { entries: LogRow[] } | undefined)?.entries
  if (live) return live
  return ((unref(logsSnapshot.data) as { entries: LogRow[] } | undefined)?.entries ?? []) as LogRow[]
})

// history paging (filter mode pages one route; unfiltered pages below the tail)
const older = ref<LogRow[]>([])
const olderBusy = ref(false)
const entries = computed(() => {
  if (filterRouteId.value) return older.value
  return paging.value ? paged.value : liveEntries.value
})

watch(filterRouteId, loadFiltered, { immediate: true })

async function loadFiltered() {
  if (!filterRouteId.value) { older.value = []; return }
  olderBusy.value = true
  try {
    const r = await useNuxtApp().$client.logs.recent({ limit: pageSize, routeId: filterRouteId.value ?? undefined })
    older.value = r.entries as LogRow[]
  }
  catch { older.value = [] }
  olderBusy.value = false
}

async function loadMore() {
  if (filterRouteId.value) {
    const list = older.value
    const beforeCursor = list.length ? list[list.length - 1]!.id : undefined
    const params: Record<string, number> = { limit: pageSize, routeId: filterRouteId.value }
    if (beforeCursor !== undefined) params.beforeId = beforeCursor
    const r = await useNuxtApp().$client.logs.recent({ limit: params.limit, routeId: params.routeId, beforeId: params.beforeId })
    older.value = [...older.value, ...r.entries as LogRow[]]
    hasMore.value = r.entries.length === pageSize
  }
  else {
    // pause the live tail and page history below its window
    if (!paging.value) { paged.value = [...liveEntries.value]; paging.value = true }
    const list = paged.value
    const beforeCursor = list.length ? list[list.length - 1]!.id : undefined
    const params: Record<string, number> = { limit: pageSize }
    if (beforeCursor !== undefined) params.beforeId = beforeCursor
    const r = await useNuxtApp().$client.logs.recent({ limit: params.limit, beforeId: params.beforeId })
    paged.value = [...paged.value, ...r.entries as LogRow[]]
    hasMore.value = r.entries.length === pageSize
  }
}

function clearFilter() {
  filterRouteId.value = null
  filterPath.value = null
  navigateTo({ path: '/admin/logs', query: {} })
}

/** drop history paging and re-attach the live tail */
function resumeLive() {
  paging.value = false
  paged.value = []
  hasMore.value = true
}

function statusClass(status: number): string {
  if (status >= 500) return 'bg-red-500/10 text-red-600'
  if (status >= 400) return 'bg-amber-500/10 text-amber-600'
  return 'bg-emerald-500/10 text-emerald-600'
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>
