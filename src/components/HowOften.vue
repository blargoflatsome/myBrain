<script setup lang="ts">
// SPEC §5: things that repeat on chosen weekdays can repeat every week or every 2 weeks.
import { messages } from '@/messages'

defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const m = messages.howOften
const chip = (on: boolean) => [
  'min-h-11 flex-1 rounded-full border px-3 text-sm',
  on ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface text-ink',
]
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-sm text-muted">{{ m.label }}</span>
    <div class="flex gap-2" role="radiogroup" :aria-label="m.label">
      <button type="button" role="radio" :aria-checked="modelValue !== 2" :class="chip(modelValue !== 2)" @click="emit('update:modelValue', 1)">{{ m.weekly }}</button>
      <button type="button" role="radio" :aria-checked="modelValue === 2" :class="chip(modelValue === 2)" @click="emit('update:modelValue', 2)">{{ m.biweekly }}</button>
    </div>
  </div>
</template>
