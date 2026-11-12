<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="mb-1 pb-2 text-sm text-muted">{{ m.priorityLabel }}</legend>
    <div class="flex flex-wrap gap-2" role="group" :aria-label="m.priorityLabel">
      <button
        v-for="p in LOW_TO_HIGH"
        :key="p.level"
        type="button"
        :class="chip(modelValue === p.level)"
        :aria-pressed="modelValue === p.level"
        @click="emit('update:modelValue', p.level)"
      >
        <span class="mr-1 inline-block size-2 rounded-full" :class="priorityDot[p.key]" aria-hidden="true" />{{ m.priority[p.key] }}
      </button>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
// SPEC §2 Choices look alike everywhere: Priority is one row of chips, Low, Medium, High, in Capture and every editor.
import { PRIORITIES } from '@/tasks/rules'
import { messages } from '@/messages'
import { chip, priorityDot } from '@/ui/styles'

defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [level: number] }>()
const m = messages.tasks
const LOW_TO_HIGH = [...PRIORITIES].reverse()
</script>
