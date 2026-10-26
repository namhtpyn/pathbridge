<script setup lang="ts">
// Shared form-modal chrome (AGENTS.md law: modal action buttons live in the
// modal's #footer slot). The submit button associates with the page's UForm
// through the HTML `form` attribute, so the form stays in #body and never
// floats its action buttons inline. Pass the SAME id to your <UForm :id>.
withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  formId: string
  submitLabel: string
  submitIcon?: string
  busy?: boolean
  contentClass?: string
}>(), { busy: false })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <UModal :open="open" :title="title" :description="description" :ui="{ content: contentClass }" @update:open="v => emit('update:open', v)">
    <template #body>
      <slot />
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="emit('update:open', false)" />
        <UButton type="submit" :form="formId" :icon="submitIcon" :loading="busy" :label="submitLabel" />
      </div>
    </template>
  </UModal>
</template>
