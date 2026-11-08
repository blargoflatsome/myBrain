<template>
  <div class="flex flex-col gap-1">
    <span class="text-sm text-muted">{{ m.label }}</span>
    <div class="flex gap-2" role="radiogroup" :aria-label="m.label">
      <button type="button" role="radio" :aria-checked="modelValue !== 2" :class="[chip(modelValue !== 2), 'flex-1']" @click="emit('update:modelValue', 1)">{{ m.weekly }}</button>
      <button type="button" role="radio" :aria-checked="modelValue === 2" :class="[chip(modelValue === 2), 'flex-1']" @click="emit('update:modelValue', 2)">{{ m.biweekly }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §5: things that repeat on chosen weekdays can repeat every week or every 2 weeks.
import { messages } from '@/messages'
import { chip } from '@/ui/styles'

defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const m = messages.howOften
</script>
