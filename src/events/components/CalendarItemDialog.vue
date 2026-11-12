<template>
  <dialog ref="dialog" :class="dialogBox" :aria-label="item?.title ?? ''" data-testid="calendar-item" @close="emit('close')">
    <div v-if="item" class="flex flex-col gap-3 p-5">
      <p class="text-sm text-muted">{{ m.kinds[item.kind] }}</p>
      <h2 class="text-xl font-bold [overflow-wrap:anywhere]" :class="struck ? 'line-through' : ''">{{ item.title }}</h2>
      <dl class="flex flex-col gap-2 text-sm">
        <div class="flex flex-wrap gap-x-2">
          <dt class="text-muted">{{ m.when }}</dt>
          <dd data-testid="calendar-item-when">{{ when }}</dd>
        </div>
        <div v-if="repeatText" class="flex flex-wrap gap-x-2">
          <dt class="text-muted">{{ m.repeats }}</dt>
          <dd>{{ repeatText }}</dd>
        </div>
        <div v-if="item.kind === 'task'" class="flex flex-wrap items-center gap-x-2">
          <dt class="text-muted">{{ t.priorityLabel }}</dt>
          <dd class="flex items-center gap-1.5"><span class="size-2 rounded-full" :class="dot[priority]" aria-hidden="true" />{{ t.priority[priority] }}</dd>
        </div>
        <div v-if="item.kind === 'task' && item.row.status !== 'open'" class="flex flex-wrap gap-x-2">
          <dt class="text-muted">{{ m.status }}</dt>
          <dd>{{ item.row.status === 'done' ? m.done : m.cancelled }}</dd>
        </div>
        <div v-if="item.kind === 'event' && item.row.reminder_minutes !== null" class="flex flex-wrap gap-x-2">
          <dt class="text-muted">{{ cal.editor.reminder }}</dt>
          <dd>{{ cal.reminder(item.row.reminder_minutes) }}</dd>
        </div>
      </dl>
      <p v-if="item.kind === 'event' && item.row.cancelled_at" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ messages.invites.cancelledNote }}</p>
      <RichNotes :value="notes" class="text-sm" data-testid="calendar-item-notes" />
      <div class="mt-2 flex gap-2">
        <button type="button" class="flex-1" :class="primaryButton" @click="emit('edit', item)">{{ m.edit }}</button>
        <button type="button" :class="secondaryButton" @click="dialog?.close()">{{ cal.editor.close }}</button>
      </div>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Calendar: tapping a task, priority task or event of mine opens it here, read-only, over the calendar;
// Edit opens its editor, still on the calendar.
import { computed, ref, watch } from 'vue'
import CloseX from '@/components/CloseX.vue'
import RichNotes from '@/components/RichNotes.vue'
import { messages } from '@/messages'
import type { EventRow, PriorityTaskRow, TaskRow } from '@/sync/types'
import { DEFAULT_PRIORITY, PRIORITIES } from '@/tasks/rules'
import { dayLabel, dayTimeLabel, timeLabel } from '@/ui/dates'
import { dialogBox, primaryButton, priorityDot, secondaryButton } from '@/ui/styles'

export type CalendarView =
  | { kind: 'task'; title: string; date: string; row: TaskRow }
  | { kind: 'priority_task'; title: string; date: string; row: PriorityTaskRow }
  | { kind: 'event'; title: string; date: string; row: EventRow }

const props = defineProps<{ item: CalendarView | null }>()
const emit = defineEmits<{ edit: [CalendarView]; close: [] }>()
const m = messages.calendar.view
const cal = messages.calendar
const t = messages.tasks
const dayNames = messages.habits.weekdayNames
const dot = priorityDot

const dialog = ref<HTMLDialogElement | null>(null)
watch(
  () => props.item,
  (i) => {
    if (!i) return dialog.value?.close()
    if (!dialog.value?.open) dialog.value?.showModal()
  },
)

const priority = computed(() => {
  const level = props.item?.kind === 'task' ? (props.item.row.priority ?? DEFAULT_PRIORITY) : DEFAULT_PRIORITY
  return PRIORITIES.find((p) => p.level === level)?.key ?? 'low'
})
const struck = computed(() => (props.item?.kind === 'task' && props.item.row.status !== 'open') || (props.item?.kind === 'event' && !!props.item.row.cancelled_at))
const notes = computed(() => {
  const i = props.item
  if (!i) return null
  return i.kind === 'task' ? i.row.notes : i.kind === 'event' ? i.row.notes : i.row.description
})
const when = computed(() => {
  const i = props.item
  if (!i) return ''
  if (i.kind === 'task') return dayLabel(i.date)
  if (i.kind === 'priority_task') return dayTimeLabel(i.date, i.row.reminder_time)
  const e = i.row
  // A repeating event shows the day that was tapped.
  const end = e.end_date === e.start_date ? e.end_time && timeLabel(e.end_time) : dayTimeLabel(e.end_date, e.end_time)
  const start = dayTimeLabel(e.repeat === 'never' ? e.start_date : i.date, e.start_time)
  if (!e.start_time && e.end_date === e.start_date) return `${start} · ${cal.editor.allDay}`
  return end ? `${start} – ${end}` : start
})
const repeatText = computed(() => {
  const i = props.item
  if (i?.kind === 'event') return i.row.repeat === 'never' ? '' : cal.repeat[i.row.repeat]
  if (i?.kind === 'priority_task' && !i.row.due_date) {
    const days = (i.row.weekdays ?? []).map((d) => dayNames[d]).join(' ')
    return i.row.week_interval === 2 ? `${days}, ${messages.howOften.biweekly.toLowerCase()}` : days
  }
  return ''
})
</script>
