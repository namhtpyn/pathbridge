<script setup lang="ts">
// Shared page heading: title + subtitle (prop or #subtitle slot for rich copy)
// with right-aligned actions in #actions.
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <div>
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ title }}</h2>
      <p v-if="subtitle || $slots.subtitle" class="text-sm text-zinc-500">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2 self-end sm:self-auto">
      <slot name="actions" />
    </div>
  </div>
</template>
