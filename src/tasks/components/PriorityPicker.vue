<template>
  <ChoiceChips :label="m.priorityLabel" :options="options" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <template #option="{ option }">
      <span class="mr-1 inline-block size-2 rounded-full" :class="priorityDot[keyOf(option.value)]" aria-hidden="true" />{{ option.label }}
    </template>
  </ChoiceChips>
</template>

<script setup lang="ts">
// SPEC §2 Choices look alike everywhere: Priority is one row of chips, Low, Medium, High, in Capture and every editor.
import ChoiceChips from '@/components/ChoiceChips.vue'
import { PRIORITIES, priorityKey } from '@/tasks/rules'
import { messages } from '@/messages'
import { priorityDot } from '@/ui/styles'

defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [level: number] }>()
const m = messages.tasks
const options = [...PRIORITIES].reverse().map((p) => ({ value: p.level as number, label: m.priority[p.key] }))
const keyOf = (level: number) => priorityKey(level)
</script>
