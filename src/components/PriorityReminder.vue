<script setup lang="ts">
// SPEC §5: full-screen reminder for due priority habits and tasks. Stays until slide to complete, Snooze or Cancel.
import { computed, onScopeDispose, ref } from 'vue'
import SlideToComplete from '@/components/SlideToComplete.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { duePriorities, type DuePriority } from '@/reminders/priority'
import { deviceTimeZone } from '@/tasks/days'
import { messages } from '@/messages'
import type { HabitLogRow, HabitRow, PriorityTaskLogRow, PriorityTaskRow, ReminderStateRow } from '@/sync/types'

const brain = useBrainStore()
const m = messages.priority

const all = <T,>(table: 'habits' | 'habit_logs' | 'priority_tasks' | 'priority_task_logs' | 'reminder_state') =>
  useLiveQuery<T[]>(async () => (brain.db ? ((await brain.db.table(table).toArray()) as T[]) : []), [], [() => brain.db])
const habits = all<HabitRow>('habits')
const habitLogs = all<HabitLogRow>('habit_logs')
const tasks = all<PriorityTaskRow>('priority_tasks')
const taskLogs = all<PriorityTaskLogRow>('priority_task_logs')
const states = all<ReminderStateRow>('reminder_state')

// Re-check every 20 seconds so a reminder appears on time and a snooze comes back.
const now = ref(new Date())
const tick = setInterval(() => (now.value = new Date()), 20_000)
onScopeDispose(() => clearInterval(tick))

const due = computed(() =>
  duePriorities(habits.value, habitLogs.value, tasks.value, taskLogs.value, states.value, now.value, deviceTimeZone()),
)
const current = computed<DuePriority | undefined>(() => due.value[0])
const slider = ref(0)

async function act(kind: 'complete' | 'snooze' | 'cancel') {
  const item = current.value
  if (!item) return
  if (kind === 'complete') await brain.completePriority(item)
  else if (kind === 'snooze') await brain.snoozePriority(item)
  else await brain.cancelPriority(item)
  slider.value++
  now.value = new Date()
}
</script>

<template>
  <div
    v-if="current"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-bg p-6 text-center"
    role="alertdialog"
    aria-modal="true"
    :aria-label="m.overlayLabel"
    data-testid="priority-reminder"
  >
    <div class="flex max-w-md flex-col gap-3">
      <p class="text-sm font-semibold tracking-wide text-danger uppercase">⚠ {{ m.eyebrow }}</p>
      <h2 class="text-4xl font-bold break-words" data-testid="priority-title">{{ current.title }}</h2>
      <p v-if="current.description" class="text-lg text-muted">{{ current.description }}</p>
      <p v-if="due.length > 1" class="text-sm text-muted">{{ m.more(due.length - 1) }}</p>
    </div>
    <div class="flex w-full max-w-md flex-col gap-4">
      <SlideToComplete :key="`${current.id}-${slider}`" :label="m.slide" :hint="m.slideHint" @complete="act('complete')" />
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="min-h-12 rounded-xl border border-line px-4 font-medium" @click="act('snooze')">{{ m.snooze }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4 font-medium" @click="act('cancel')">{{ m.cancel }}</button>
      </div>
    </div>
    <p class="max-w-md text-xs text-muted">{{ m.reliability }}</p>
  </div>
</template>
