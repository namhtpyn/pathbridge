<script setup lang="ts">
// Detects a newer deployed build (Nuxt's built-in check-outdated-build plugin
// polls builds/latest.json and fires app:manifest:update) and offers a reload.
const newVersion = ref(false)
const dismissed = ref(false)

if (import.meta.client) {
  const nuxtApp = useNuxtApp()
  nuxtApp.hooks.hookOnce('app:manifest:update', (meta) => {
    // eslint-disable-next-line no-console
    console.info('[pathbridge] newer build available:', (meta as { id?: string })?.id)
    newVersion.value = true
  })
}

function reload() {
  window.location.reload()
}
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <Teleport to="body">
      <div
        v-if="newVersion && !dismissed"
        class="fixed bottom-4 right-4 z-[9999] max-w-sm"
        role="status"
        aria-live="polite"
      >
        <UCard :ui="{ root: 'shadow-lg' }">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-refresh-cw" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-zinc-900 dark:text-white">New version available</p>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                A newer build of Pathbridge is deployed. Reload to update.
              </p>
              <div class="mt-3 flex gap-2">
                <UButton size="xs" label="Reload" icon="i-lucide-rotate-cw" @click="reload" />
                <UButton size="xs" color="neutral" variant="ghost" label="Later" @click="dismissed = true" />
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </Teleport>
  </UApp>
</template>
