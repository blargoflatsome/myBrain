<template>
  <fieldset class="flex flex-col gap-3" data-testid="habit-how-often">
    <legend class="sr-only">{{ f.howOften }}</legend>
    <HowOften :model-value="weekInterval" :monthly="monthly" :start-date="startDate" @update:model-value="weekInterval = $event" @update:monthly="monthly = $event" />
    <div v-if="!monthly" class="flex flex-col gap-1">
      <span :id="`${uid}-days`" class="text-sm text-muted">{{ m.editor.weekdays }}</span>
      <div class="flex flex-wrap gap-1.5" role="group" :aria-labelledby="`${uid}-days`">
        <button
          v-for="d in ALL_WEEKDAYS"
          :key="d"
          type="button"
          :class="dayChip(weekdays.includes(d))"
          :aria-pressed="weekdays.includes(d)"
          @click="toggleDay(d)"
        >
          {{ m.weekdayNames[d] }}
        </button>
      </div>
    </div>
    <DateInput v-model="startDate" :label="m.editor.startDate" :min="minStart" required :input-class="fieldClass" />
  </fieldset>

  <fieldset class="flex flex-col gap-3 rounded-xl border border-line p-3" data-testid="habit-reminders">
    <legend class="px-1 text-sm font-medium">{{ f.reminders }}</legend>
    <p class="-mt-1 text-xs text-muted">{{ m.editor.remindersHint }}</p>
    <div class="grid gap-3 sm:grid-cols-2">
      <TimeInput v-model="notifyTime" :label="m.editor.notifyTime" :input-class="fieldClass" />
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.timer }}
        <select v-model="timer" :disabled="!notifyTime" :class="[fieldClass, 'disabled:opacity-50']">
          <option :value="null">{{ m.editor.timerNone }}</option>
          <option v-for="t in TIMER_OPTIONS" :key="t" :value="t">{{ m.editor.timerOptions[t] }}</option>
        </select>
      </label>
    </div>
    <p class="-mt-1 text-xs text-muted">{{ m.editor.timerHint }}</p>
    <label class="flex items-start gap-3">
      <input v-model="isPriority" type="checkbox" class="mt-1 size-5 shrink-0 accent-[var(--accent)]">
      <span>
        <span class="font-medium">{{ m.editor.priority }}</span>
        <span class="block text-sm text-muted">{{ m.editor.priorityHint }}</span>
      </span>
    </label>
  </fieldset>

  <MoreOptions :summary="m.editor.moreSummary" :start-open="moreOpen" test-id="habit-more">
    <label class="flex items-start gap-3">
      <input v-model="isPrivate" type="checkbox" class="mt-1 size-5 shrink-0 accent-[var(--accent)]">
      <span>
        <span class="font-medium">{{ m.editor.private }}</span>
        <span class="block text-sm text-muted">{{ m.editor.privateHint }}</span>
      </span>
    </label>
    <slot name="more" />
  </MoreOptions>
</template>

<script setup lang="ts">
// SPEC §5 Habits and Quick capture: the habit form shared by the habit editor and Capture. How often sits with the
// days it repeats on and when it starts; reminders (time, timer, Priority) are grouped in their own box; Private and
// tags are optional, in More details.
import { useId, watch } from 'vue'
import HowOften from '@/components/HowOften.vue'
import TimeInput from '@/components/TimeInput.vue'
import DateInput from '@/components/DateInput.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import { ALL_WEEKDAYS } from '@/habits/rules'
import { messages } from '@/messages'
import { dayChip } from '@/ui/styles'

defineProps<{ minStart: string; fieldClass: string; moreOpen?: boolean }>()
const weekInterval = defineModel<number>('weekInterval', { required: true })
const monthly = defineModel<boolean>('monthly', { required: true })
const weekdays = defineModel<number[]>('weekdays', { required: true })
const startDate = defineModel<string>('startDate', { required: true })
const notifyTime = defineModel<string>('notifyTime', { required: true })
const timer = defineModel<number | null>('timer', { required: true })
const isPriority = defineModel<boolean>('isPriority', { required: true })
const isPrivate = defineModel<boolean>('isPrivate', { required: true })

const m = messages.habits
const f = messages.forms
const uid = useId()
const TIMER_OPTIONS = [15, 30, 60, 120, 180, 240]

// A timer starts at the reminder time, so it needs one.
watch(notifyTime, (t) => {
  if (!t) timer.value = null
})
function toggleDay(d: number) {
  const has = weekdays.value.includes(d)
  if (has && weekdays.value.length === 1) return // at least one day
  weekdays.value = has ? weekdays.value.filter((x) => x !== d) : [...weekdays.value, d].sort()
}
</script>
