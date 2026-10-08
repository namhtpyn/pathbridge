<template>
  <div class="w-full space-y-2">
    <div v-for="(row, i) in rows" :key="i" class="flex items-center gap-1.5 max-sm:flex-wrap">
      <UInput
        :model-value="row.name"
        placeholder="header-name"
        icon="i-lucide-braces"
        class="min-w-20 flex-1 font-mono text-xs" :title="row.name"
        @update:model-value="v => patch(i, { name: String(v) })"
      />
      <USelect
        :model-value="row.op"
        :items="[{ label: 'set', value: 'set' }, { label: 'remove', value: 'remove' }]"
        class="w-26 shrink-0 font-mono text-xs"
        @update:model-value="v => patch(i, { op: v as 'set' | 'remove' })"
      />
      <UInput
        v-if="row.op === 'set'"
        :model-value="row.value"
        placeholder="value"
        class="min-w-24 flex-[1.4] font-mono text-xs" :title="row.value"
        @update:model-value="v => patch(i, { value: String(v) })"
      />
      <div v-else class="hidden min-w-0 flex-1 text-xs text-zinc-400 sm:block" aria-hidden="true" />
      <UButton icon="i-lucide-x" variant="ghost" color="error" size="xs" aria-label="Remove header row" @click="removeRow(i)" />
    </div>
    <UButton
      icon="i-lucide-plus" variant="outline" color="neutral" size="xs" label="Add header"
      class="font-normal text-zinc-500"
      :disabled="rows.length >= 20"
      @click="addRow()"
    />
  </div>
</template>

<script setup lang="ts">
// Editable list of header-override rows for the route modal. Deliberately
// LOOSE (empty strings allowed while typing) — the submit schema in
// app/utils/route-form.ts normalizes/validates, and the backend re-validates.
import type { HeaderRowInput } from '~/utils/route-form'

const props = defineProps<{ modelValue: HeaderRowInput[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: HeaderRowInput[]): void }>()

const rows = computed<HeaderRowInput[]>(() => props.modelValue ?? [])

function addRow() {
  emit('update:modelValue', [...rows.value, { name: '', op: 'set', value: '' }])
}

function patch(i: number, part: Partial<HeaderRowInput>) {
  const next = rows.value.map((r, idx) => idx === i ? { ...r, ...part } : r)
  emit('update:modelValue', next)
}

function removeRow(i: number) {
  emit('update:modelValue', rows.value.filter((_, idx) => idx !== i))
}
</script>
