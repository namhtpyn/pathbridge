<script setup lang="ts">
// Shared destructive-action confirm (DESIGN_SYSTEM law: never native confirm()).
// Description = what is being removed; body states the consequence; busy keeps
// the dialog open with a loading confirm while the parent's mutation runs.
withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  confirmIcon?: string
  busy?: boolean
}>(), { confirmLabel: 'Delete', confirmIcon: 'i-lucide-trash-2', busy: false })
const emit = defineEmits<{ 'update:open': [value: boolean], confirm: [] }>()
</script>

<template>
  <UModal :open="open" :title="title" :description="description" @update:open="v => emit('update:open', v)">
    <template #body>
      <p class="text-sm text-zinc-500">This action cannot be undone.</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" label="Cancel" @click="emit('update:open', false)" />
        <UButton color="error" :icon="confirmIcon" :loading="busy" :label="confirmLabel" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
