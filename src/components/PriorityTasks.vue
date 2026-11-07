<script setup lang="ts">
// SPEC §5: priority tasks — one-off (a date) or repeating on chosen weekdays — with a reminder time.
import TimeInput from '@/components/TimeInput.vue'
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import HowOften from '@/components/HowOften.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { messages } from '@/messages'
import type { PriorityTaskRow } from '@/sync/types'

const props = defineProps<{ openId?: string | null }>()
const emit = defineEmits<{ opened: [] }>()
const brain = useBrainStore()
const m = messages.priority
const dayNames = messages.habits.weekdayNames
const ALL = [0, 1, 2, 3, 4, 5, 6]

const tasks = useLiveQuery<PriorityTaskRow[]>(
  async () => (brain.db ? (await brain.db.priority_tasks.toArray()).filter((t) => !t.deleted_at) : []),
  [],
  [() => brain.db],
)
const sorted = computed(() => [...tasks.value].sort((a, b) => a.reminder_time.localeCompare(b.reminder_time)))

function when(t: PriorityTaskRow) {
  const time = t.reminder_time.slice(0, 5)
  return t.due_date ? `${m.once(t.due_date)} ${m.at(time)}` : `${m.repeats((t.weekdays ?? []).map((d) => dayNames[d]).join(' '))}${t.week_interval === 2 ? `, ${messages.howOften.biweekly.toLowerCase()}` : ''} ${m.at(time)}`
}

// ---------- editor ----------
const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
const editing = ref<PriorityTaskRow | null>(null)
const isNew = ref(false)
const title = ref('')
const description = ref('')
const time = ref('08:00')
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
    reminder_time: '08:00',
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
  date.value = t.due_date ?? todayIn(deviceTimeZone())
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
  await brain.savePriorityTask({
    ...editing.value,
    title: title.value.trim(),
    description: description.value.trim() || null,
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

const field = 'min-h-12 rounded-xl border border-line bg-bg px-3 text-base text-ink'
const chip = (on: boolean) => [
  'min-h-11 min-w-11 rounded-full border px-2 text-sm',
  on ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface text-ink',
]
</script>

<template>
  <section class="flex flex-col gap-3">
    <p class="text-muted">{{ m.tabIntro }}</p>
    <button type="button" class="min-h-12 self-start rounded-xl border border-line bg-surface px-4 font-medium" @click="open(null)">{{ m.add }}</button>
    <p v-if="!sorted.length" class="text-muted">{{ m.empty }}</p>
    <ul class="flex flex-col gap-2">
      <li v-for="t in sorted" :key="t.id">
        <button type="button" class="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-surface p-3 text-left" @click="open(t)">
          <span class="font-medium">⚠ {{ t.title }}</span>
          <span class="text-xs text-muted" data-testid="priority-when">{{ when(t) }}</span>
        </button>
      </li>
    </ul>

    <dialog
      ref="dialog"
      class="m-auto w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
      :aria-label="isNew ? m.editor.newHeading : m.editor.heading"
      @close="editing = null"
    >
      <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
        <h2 class="text-lg font-semibold">{{ isNew ? m.editor.newHeading : m.editor.heading }}</h2>
        <label class="flex flex-col gap-1 text-sm text-muted">{{ m.editor.title }}<input v-model="title" maxlength="500" required :class="field"></label>
        <label class="flex flex-col gap-1 text-sm text-muted">{{ m.editor.description }}<textarea v-model="description" maxlength="5000" rows="2" :class="[field, 'py-2']" /></label>
        <TimeInput v-model="time" :label="m.editor.time" required :input-class="field" />
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ m.editor.when }}</legend>
          <div class="flex gap-2" role="group" :aria-label="m.editor.when">
            <button type="button" :class="chip(mode === 'repeat')" :aria-pressed="mode === 'repeat'" @click="mode = 'repeat'">{{ m.editor.repeat }}</button>
            <button type="button" :class="chip(mode === 'once')" :aria-pressed="mode === 'once'" @click="mode = 'once'">{{ m.editor.once }}</button>
          </div>
          <div v-if="mode === 'repeat'" class="flex flex-wrap gap-1.5" role="group" :aria-label="m.editor.repeat">
            <button v-for="d in ALL" :key="d" type="button" :class="chip(weekdays.includes(d))" :aria-pressed="weekdays.includes(d)" @click="toggleDay(d)">{{ dayNames[d] }}</button>
          </div>
          <HowOften v-if="mode === 'repeat'" v-model="weekInterval" />
          <label v-else class="flex flex-col gap-1 text-sm text-muted">{{ m.editor.date }}<input v-model="date" type="date" required :class="field"></label>
        </fieldset>
        <div class="flex gap-2">
          <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
          <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
        </div>
        <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.showModal()">{{ m.editor.delete }}</button>
      </form>
    </dialog>

    <dialog
      ref="confirmDialog"
      class="m-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
      role="alertdialog"
      :aria-label="m.confirmDelete.heading"
    >
      <h2 class="text-lg font-semibold">{{ m.confirmDelete.heading }}</h2>
      <p class="mt-2 text-muted">{{ m.confirmDelete.body(editing?.title ?? '') }}</p>
      <div class="mt-4 flex gap-2">
        <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink" @click="remove">{{ m.confirmDelete.confirm }}</button>
        <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmDialog?.close()">{{ m.confirmDelete.keep }}</button>
      </div>
    </dialog>
  </section>
</template>
