<template>
  <div :class="groupClass" role="group" :aria-label="ariaLabel" :aria-labelledby="labelledby">
    <button
      v-for="d in ALL_WEEKDAYS"
      :key="d"
      type="button"
      :class="dayChip(modelValue.includes(d))"
      :aria-pressed="modelValue.includes(d)"
      @click="emit('update:modelValue', toggleWeekday(modelValue, d))"
    >
      {{ names[d] }}
    </button>
  </div>
</template>

<script setup lang="ts">
// The weekday chips habits, routines and priority tasks repeat on (SPEC §5 Habits): at least one day stays chosen.
import { ALL_WEEKDAYS, toggleWeekday } from '@/habits/rules'
import { messages } from '@/messages'
import { dayChip } from '@/ui/styles'

withDefaults(defineProps<{ modelValue: number[]; ariaLabel?: string; labelledby?: string; groupClass?: string }>(), {
  ariaLabel: undefined,
  labelledby: undefined,
  groupClass: 'flex flex-wrap gap-1.5',
})
const emit = defineEmits<{ 'update:modelValue': [days: number[]] }>()
const names = messages.habits.weekdayNames
</script>
