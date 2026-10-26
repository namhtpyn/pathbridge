<script setup lang="ts">
// Shared RBAC scope matrix: resource→action rows grouped by resource, a
// none/own/all radio per action plus a master radio per group (sets every
// action at once; 'mixed' shows no master selection). Exactly one scope per
// action — the emitted record never carries both action:own and action:all,
// and empty resources are omitted. Used by the role editor (availability =
// vocabulary) and the API-key editor (availability = vocabulary ∩ the current
// user's own grants, per the narrow-only law).
import type { TableColumn } from '@nuxt/ui'
import { getGroupedRowModel } from '@tanstack/vue-table'

const props = withDefaults(defineProps<{
  rows: Array<{ resource: string, action: string }>
  modelValue: Record<string, string[]>
  scopeAvailable?: (resource: string, action: string, scope: 'own' | 'all') => boolean
}>(), { scopeAvailable: () => () => true })
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string[]>): void }>()

const columns: TableColumn<{ resource: string, action: string }>[] = [
  { accessorKey: 'resource', header: 'Resource' },
  { accessorKey: 'action', header: 'Action', meta: { class: { td: 'w-full' } } },
  { id: 'none', header: 'None', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
  { id: 'own', header: 'Own', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
  { id: 'all', header: 'All', meta: { class: { th: 'text-center w-16', td: 'text-center' } } },
]

function scopeFor(resource: string, action: string): 'none' | 'own' | 'all' {
  const cur = props.modelValue[resource] ?? []
  if (cur.includes(`${action}:all`)) return 'all'
  if (cur.includes(`${action}:own`)) return 'own'
  return 'none'
}

/** master radio state for a resource group; 'mixed' when its actions disagree */
function masterScopeFor(resource: string): 'none' | 'own' | 'all' | 'mixed' {
  const scopes = props.rows.filter(r => r.resource === resource).map(r => scopeFor(resource, r.action))
  if (!scopes.length) return 'none'
  const first = scopes[0]!
  return scopes.every(x => x === first) ? first : 'mixed'
}

function actions(resource: string): string[] {
  return props.rows.filter(r => r.resource === resource).map(r => r.action)
}

function masterAvailable(resource: string, scope: 'own' | 'all'): boolean {
  return actions(resource).some(a => props.scopeAvailable!(resource, a, scope))
}

function setScope(resource: string, action: string, scope: 'none' | 'own' | 'all') {
  const next: Record<string, string[]> = { ...props.modelValue }
  const kept = (next[resource] ?? []).filter(s => s !== `${action}:all` && s !== `${action}:own`)
  if (scope !== 'none' && props.scopeAvailable!(resource, action, scope)) kept.push(`${action}:${scope}`)
  if (kept.length) next[resource] = kept
  else delete next[resource]
  emit('update:modelValue', next)
}

function setMasterScope(resource: string, scope: 'none' | 'own' | 'all') {
  const next: Record<string, string[]> = { ...props.modelValue }
  delete next[resource]
  if (scope !== 'none') {
    for (const a of actions(resource)) {
      if (props.scopeAvailable!(resource, a, scope)) (next[resource] ??= []).push(`${a}:${scope}`)
    }
  }
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="w-full space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
    <UTable
      :data="rows"
      :columns="columns"
      :grouping="['resource']"
      :grouping-options="{ groupedColumnMode: false, getGroupedRowModel: getGroupedRowModel() }"
      :ui="{ root: 'min-w-full', td: 'empty:p-0' }"
    >
      <template #resource-cell="{ row }">
        <div v-if="row.getIsGrouped()" class="flex items-center gap-2">
          <IconButton
            size="xs"
            :text="row.getIsExpanded() ? 'Collapse group' : 'Expand group'"
            :icon="row.getIsExpanded() ? 'i-lucide-minus' : 'i-lucide-plus'"
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
        <div v-if="row.getIsGrouped() && masterAvailable(row.original.resource, 'own')" class="flex justify-center">
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
        <div v-if="row.getIsGrouped() && masterAvailable(row.original.resource, 'all')" class="flex justify-center">
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
</template>
