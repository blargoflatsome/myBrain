<template>
  <section class="flex flex-col gap-3">
    <template v-if="!editorOnly">
      <p class="text-muted">{{ m.tabIntro }}</p>
      <button type="button" class="min-h-12 self-start rounded-xl border border-line bg-surface px-4 font-medium" @click="open(null)">{{ m.add }}</button>
      <p v-if="!sorted.length" class="text-muted">{{ m.empty }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="t in sorted" :key="t.id" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3" data-testid="priority-row">
          <AppIcon name="alert" size="size-6" class="mt-0.5 text-carried" />
          <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="open(t)">
            <span class="text-base break-words">{{ t.title }}</span>
            <span class="text-xs text-muted" data-testid="priority-when">{{ when(t) }}</span>
          </button>
          <button type="button" :class="rowAction" :aria-label="messages.tasks.editLabel(t.title)" @click="open(t)">
            <AppIcon name="pencil" />{{ messages.tasks.edit }}
          </button>
        </li>
      </ul>
    </template>

    <dialog
      ref="dialog"
      :class="dialogBox"
      :aria-label="isNew ? m.editor.newHeading : m.editor.heading"
      @close="editing = null"
    >
      <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
        <h2 class="text-lg font-semibold">{{ isNew ? m.editor.newHeading : m.editor.heading }}</h2>
        <label class="flex flex-col gap-1 text-sm text-muted">{{ m.editor.title }}<input v-model="title" maxlength="500" required :class="field"></label>
        <TimeInput v-model="time" :label="m.editor.time" required :input-class="field" />
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ m.editor.when }}</legend>
          <div class="flex gap-2" role="group" :aria-label="m.editor.when">
            <button type="button" :class="dayChip(mode === 'repeat')" :aria-pressed="mode === 'repeat'" @click="mode = 'repeat'">{{ m.editor.repeat }}</button>
            <button type="button" :class="dayChip(mode === 'once')" :aria-pressed="mode === 'once'" @click="mode = 'once'">{{ m.editor.once }}</button>
          </div>
          <div v-if="mode === 'repeat'" class="flex flex-wrap gap-1.5" role="group" :aria-label="m.editor.repeat">
            <button v-for="d in ALL" :key="d" type="button" :class="dayChip(weekdays.includes(d))" :aria-pressed="weekdays.includes(d)" @click="toggleDay(d)">{{ dayNames[d] }}</button>
          </div>
          <HowOften v-if="mode === 'repeat'" v-model="weekInterval" />
          <DateInput v-else v-model="date" :label="m.editor.date" :min="todayIn(deviceTimeZone())" required :input-class="field" />
        </fieldset>
        <NotesEditor v-model="description" :label="m.editor.description" test-id="priority-description" />
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <div class="flex gap-2">
          <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
          <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
        </div>
        <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">{{ m.editor.delete }}</button>
      </form>
      <CloseX @click="dialog?.close()" />
    </dialog>

    <ConfirmDialog
      ref="confirmDialog"
      :heading="m.confirmDelete.heading"
      :body="m.confirmDelete.body(editing?.title ?? '')"
      :confirm-label="m.confirmDelete.confirm"
      :keep-label="m.confirmDelete.keep"
      @confirm="remove"
    />
  </section>
</template>

<script setup lang="ts">
// SPEC §5: priority tasks — one-off (a date) or repeating on chosen weekdays — with a reminder time.
import AppIcon from '@/components/AppIcon.vue'
import CloseX from '@/components/CloseX.vue'
import TimeInput from '@/components/TimeInput.vue'
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import HowOften from '@/components/HowOften.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { messages } from '@/messages'
import type { PriorityTaskRow } from '@/sync/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DateInput from '@/components/DateInput.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import { storedNotes } from '@/journal/body'
import { dayChip, dialogBox, field, rowAction } from '@/ui/styles'
import { live } from '@/sync/live'
import { firstFutureDay, isLater } from '@/reminders/priority'
import { nextWholeHour } from '@/events/rules'
import { dayLabel, timeLabel } from '@/ui/dates'

// editorOnly: just the editor, for opening a priority task from the calendar (SPEC §5 Calendar).
const props = defineProps<{ openId?: string | null; editorOnly?: boolean }>()
const emit = defineEmits<{ opened: [] }>()
const brain = useBrainStore()
const m = messages.priority
const dayNames = messages.habits.weekdayNames
const ALL = [0, 1, 2, 3, 4, 5, 6]

const tasks = useLiveQuery<PriorityTaskRow[]>(
  async () => (brain.db ? live(await brain.db.priority_tasks.toArray()) : []),
  [],
  [() => brain.db],
)
const sorted = computed(() => [...tasks.value].sort((a, b) => a.reminder_time.localeCompare(b.reminder_time)))

function when(t: PriorityTaskRow) {
  const time = timeLabel(t.reminder_time)
  return t.due_date ? `${m.once(dayLabel(t.due_date))} ${m.at(time)}` : `${m.repeats((t.weekdays ?? []).map((d) => dayNames[d]).join(' '))}${t.week_interval === 2 ? `, ${messages.howOften.biweekly.toLowerCase()}` : ''} ${m.at(time)}`
}

// ---------- editor ----------
const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const editing = ref<PriorityTaskRow | null>(null)
const isNew = ref(false)
const title = ref('')
const description = ref('')
const time = ref('08:00')
const error = ref('')
const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const mode = ref<'once' | 'repeat'>('repeat')
const date = ref('')
const weekdays = ref<number[]>([...ALL])
const weekInterval = ref(1)

function open(t: PriorityTaskRow | null) {
  isNew.value = !t
  const today = todayIn(deviceTimeZone())
  editing.value = t ?? {
    id: crypto.randomUUID(),
    title: '',
    description: null,
    // A new one starts at the next whole hour, so it's always in the future (SPEC §5 Priority tasks).
    reminder_time: nextWholeHour(),
    due_date: null,
    weekdays: [...ALL],
    start_date: today,
    deleted_at: null,
  }
}

// Opened from the calendar with a priority task's id: open its editor.
watch(
  [() => props.openId, tasks],
  ([id]) => {
    const t = id ? tasks.value.find((x) => x.id === id) : undefined
    if (!t) return
    open(t)
    emit('opened')
  },
  { immediate: true },
)
watch(editing, (t) => {
  if (!t) return dialog.value?.close()
  title.value = t.title
  description.value = t.description ?? ''
  time.value = t.reminder_time.slice(0, 5)
  mode.value = t.due_date ? 'once' : 'repeat'
  error.value = ''
  date.value = t.due_date ?? firstFutureDay(t.reminder_time, todayIn(deviceTimeZone()), nowTime())
  weekdays.value = [...(t.weekdays ?? ALL)]
  weekInterval.value = t.week_interval ?? 1
  dialog.value?.showModal()
})
function toggleDay(d: number) {
  const has = weekdays.value.includes(d)
  if (has && weekdays.value.length === 1) return
  weekdays.value = has ? weekdays.value.filter((x) => x !== d) : [...weekdays.value, d].sort()
}
async function save() {
  if (!editing.value || !title.value.trim() || !time.value) return
  const today = todayIn(deviceTimeZone())
  if (mode.value === 'once' && !isLater(date.value, time.value, today, nowTime())) {
    error.value = m.editor.pastError
    return
  }
  // A repeating one that starts today (a new one, or one made today) moves to tomorrow if its time has passed.
  const start = editing.value.start_date >= today ? firstFutureDay(time.value, today, nowTime()) : editing.value.start_date
  await brain.savePriorityTask({
    ...editing.value,
    start_date: start,
    title: title.value.trim(),
    description: storedNotes(description.value),
    reminder_time: time.value,
    due_date: mode.value === 'once' ? date.value : null,
    weekdays: mode.value === 'repeat' ? weekdays.value : null,
    week_interval: mode.value === 'repeat' ? weekInterval.value : 1,
  })
  editing.value = null
}
async function remove() {
  if (editing.value) await brain.deletePriorityTask(editing.value.id)
  confirmDialog.value?.close()
  editing.value = null
}

</script>
