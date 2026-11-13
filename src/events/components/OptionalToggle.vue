<template>
  <!-- SPEC §10 Scheduler: an optional person doesn't hold up a suggested time. -->
  <label class="flex min-h-9 items-center gap-1.5 text-xs text-muted">
    <input type="checkbox" :class="checkbox" :checked="modelValue" :aria-label="m.optionalLabel(name)" data-testid="optional-toggle" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
    <span aria-hidden="true">{{ m.optional }}</span>
  </label>
</template>

<script setup lang="ts">
import { messages } from '@/messages'
import { checkbox } from '@/ui/styles'

defineProps<{ name: string; modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const m = messages.invites
</script>
