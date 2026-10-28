<script setup lang="ts">
// Shared empty/placeholder state: icon + heading + copy + optional action
// button(s) via the default slot. `dashed` = "nothing yet" (encouraging);
// solid border = data-shaped placeholder (e.g. loading).
withDefaults(defineProps<{
  icon: string
  title: string
  description?: string
  dashed?: boolean
  loading?: boolean
}>(), { dashed: true, loading: false })
</script>

<template>
  <div class="rounded-xl border p-10 text-center" :class="loading
    ? 'border-zinc-200 dark:border-zinc-800'
    : 'border-dashed border-zinc-300 dark:border-zinc-700'">
    <UIcon :name="loading ? 'i-lucide-loader-circle' : icon" class="mx-auto size-8 text-zinc-300" :class="loading ? 'animate-spin' : ''" />
    <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ title }}</p>
    <p v-if="description" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ description }}</p>
    <slot />
  </div>
</template>
