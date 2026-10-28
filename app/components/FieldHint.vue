<script setup lang="ts">
// Shared hover-help hint for form fields (DESIGN_SYSTEM law: hover help is a
// UPopover in the field's #hint slot, never #label). Trigger is a focusable
// button (keyboard = focus opens the popover; touch via enable-touch) — a
// hover-only icon made every field's help unreachable for a11y.
defineProps<{
  title: string
  example?: string
}>()
</script>

<template>
  <UPopover mode="hover" enable-touch :content="{ side: 'top', align: 'center' }">
    <template #default>
      <button type="button" :aria-label="`About ${title}`" class="mb-0.5 cursor-help rounded-sm text-zinc-400 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-primary dark:hover:text-zinc-300">
        <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      </button>
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
