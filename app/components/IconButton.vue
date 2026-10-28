<script setup lang="ts">
// Icon-only buttons MUST carry a hover popover label (DESIGN_SYSTEM law):
// plain icons are unguessable. UButton wrapped in UPopover mode="hover"
// (enable-touch; focus/blur open it for keyboard users); aria-label stays
// for screen readers.
const props = withDefaults(defineProps<{
  text: string
  icon: string
  ariaLabel?: string
  color?: 'primary' | 'neutral' | 'error' | 'success' | 'warning'
  variant?: 'solid' | 'outline' | 'ghost' | 'link' | 'subtle'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
}>(), {
  color: 'neutral',
  variant: 'ghost',
  size: 'sm',
  disabled: false,
  loading: false,
  type: 'button',
})
const emit = defineEmits<{ click: [event: MouseEvent] }>()
const hintOpen = ref(false)
</script>

<template>
  <UPopover v-model:open="hintOpen" mode="hover" enable-touch :content="{ side: 'top', align: 'center' }" :ui="{ content: 'p-1.5 text-xs' }">
    <template #default>
      <UButton
        :icon="props.icon"
        :color="props.color"
        :variant="props.variant"
        :size="props.size"
        :disabled="props.disabled"
        :loading="props.loading"
        :type="props.type"
        :aria-label="props.ariaLabel ?? props.text"
        @focus="hintOpen = true"
        @blur="hintOpen = false"
        @click="emit('click', $event)"
      />
    </template>
    <template #content>
      <span class="block whitespace-nowrap">{{ props.text }}</span>
    </template>
  </UPopover>
</template>
