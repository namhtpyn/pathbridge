<script setup lang="ts">
// Shared hover-help hint for form fields (DESIGN_SYSTEM law: hover help is a
// UPopover in the field's #hint slot, never #label). Put the same id on your
// UForm and pass it here so the footer submit button submits that form.
defineProps<{
  title: string
  example?: string
}>()
</script>

<template>
  <UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
    <template #default>
      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
    </template>
    <template #content>
      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
        <p class="text-xs font-semibold text-white">{{ title }}</p>
        <p class="text-xs text-zinc-200"><slot /></p>
        <p v-if="example" class="break-all rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white">{{ example }}</p>
      </div>
    </template>
  </UPopover>
</template>
