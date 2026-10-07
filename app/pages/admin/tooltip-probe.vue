<template>
  <div class="p-16 space-y-16">
    <div>app pattern (popover): <UPopover :content="{ side: 'top', align: 'center' }"><template #default><UIcon name="i-lucide-info" class="size-4" /></template><template #content><div class="max-w-64 p-3 bg-zinc-800 rounded-md"><p>Path help text</p></div></template></UPopover></div>
  </div>
</template>
