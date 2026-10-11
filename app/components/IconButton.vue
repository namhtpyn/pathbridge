<script setup lang="ts">
// Icon-only buttons MUST carry a visible tooltip (DESIGN_SYSTEM law): plain
// icons are unguessable for new users and unreadable on touch. Wraps UButton
// in a hover UPopover; aria-label stays for screen readers.
const props = withDefaults(defineProps<{
  tooltip: string
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
</script>

<template>
  <UPopover mode="hover" :content="{ side: 'top', align: 'center' }" :ui="{ content: 'p-1.5 text-xs' }">
    <template #default>
      <UButton
        :icon="props.icon"
        :color="props.color"
        :variant="props.variant"
        :size="props.size"
        :disabled="props.disabled"
        :loading="props.loading"
        :type="props.type"
        :aria-label="props.ariaLabel ?? props.tooltip"
        @click="emit('click', $event)"
      />
    </template>
    <template #content>
      <span class="block whitespace-nowrap">{{ props.tooltip }}</span>
    </template>
  </UPopover>
</template>
