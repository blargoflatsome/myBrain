<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[92dvh] w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    :aria-label="isNew ? m.editor.newHeading : m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" novalidate @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ isNew ? m.editor.newHeading : m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.title }}
        <input v-model="title" maxlength="500" :class="field" @input="error = ''">
      </label>
      <label class="flex items-center justify-between gap-4">
        <span class="font-medium">{{ m.editor.allDay }}</span>
        <input v-model="allDay" type="checkbox" class="size-5 accent-[var(--accent)]">
      </label>
      <fieldset class="grid grid-cols-2 gap-3">
        <legend class="mb-1 text-sm font-medium">{{ m.editor.start }}</legend>
        <label class="flex flex-col gap-1 text-sm text-muted" :class="allDay ? 'col-span-2' : ''">
          {{ m.editor.date }}
          <input v-model="startDate" type="date" :class="field" :aria-label="`${m.editor.start} ${m.editor.date}`">
        </label>
        <TimeInput v-if="!allDay" v-model="startTime" :label="m.editor.time" :aria-label="`${m.editor.start} ${m.editor.time}`" :input-class="field" />
      </fieldset>
      <fieldset class="grid grid-cols-2 gap-3">
        <legend class="mb-1 text-sm font-medium">{{ m.editor.end }}</legend>
        <label class="flex flex-col gap-1 text-sm text-muted" :class="allDay ? 'col-span-2' : ''">
          {{ m.editor.date }}
          <input v-model="endDate" type="date" :class="field" :aria-label="`${m.editor.end} ${m.editor.date}`">
        </label>
        <TimeInput v-if="!allDay" v-model="endTime" :label="m.editor.time" :aria-label="`${m.editor.end} ${m.editor.time}`" :input-class="field" />
      </fieldset>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.repeat }}
        <select v-model="repeat" :class="field">
          <option v-for="r in REPEATS" :key="r" :value="r">{{ m.repeat[r] }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.reminder }}
        <select v-model="reminder" :class="field">
          <option v-for="r in REMINDERS" :key="String(r)" :value="r">{{ m.reminder(r) }}</option>
        </select>
        <span v-if="allDay && reminder !== null" class="text-xs">{{ m.editor.reminderAllDay }}</span>
      </label>
      <label class="flex items-center justify-between gap-4 text-sm">
        <span><span class="font-medium">{{ c.showGuests }}</span><span class="block text-xs text-muted">{{ c.showGuestsHint }}</span></span>
        <input v-model="showGuests" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.notes }}
        <textarea v-model="notes" maxlength="20000" rows="2" :class="[field, 'py-2']" />
      </label>
      <EventPeople
        v-if="event && !event.cancelled_at"
        v-model="people"
        :event-id="event.id"
        :is-new="isNew"
        :start-date="startDate"
        :start-time="allDay ? null : startTime"
        :end-date="endDate || startDate"
        :end-time="allDay ? null : endTime"
        @suggest="useSuggestion"
      />
      <p v-if="event?.cancelled_at" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ messages.invites.cancelledNote }}</p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button
        v-if="!isNew && event && !event.cancelled_at"
        type="button"
        class="min-h-11 self-start rounded-xl border border-danger px-4 text-sm font-semibold text-danger"
        @click="emit('cancel', event)"
      >
        {{ messages.cancelEvent.button }}
      </button>
      <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">
        {{ m.editor.delete }}
      </button>
    </form>
  </dialog>

  <ConfirmDialog
    ref="confirmDialog"
    :heading="m.confirmDelete.heading"
    :body="m.confirmDelete.body(event?.title ?? '', (event?.repeat ?? 'never') !== 'never')"
    :confirm-label="m.confirmDelete.confirm"
    :keep-label="m.confirmDelete.keep"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
// SPEC §5 Calendar and reminders: add or edit a personal event: title, start and end (or all day), repeat,
// reminder, notes. Delete asks first; deleting a repeating event deletes the whole series.
import TimeInput from '@/components/TimeInput.vue'
import { computed, ref, watch } from 'vue'
import EventPeople from '@/components/EventPeople.vue'
import type { PersonToInvite } from '@/events/sharing'
import { eventProblem, nextWholeHour, REMINDERS, REPEATS } from '@/events/rules'
import { messages } from '@/messages'
import type { EventRepeat, EventRow } from '@/sync/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { field } from '@/ui/styles'

const props = defineProps<{ event: EventRow | null; isNew: boolean }>()
const emit = defineEmits<{ save: [EventRow, PersonToInvite[]]; delete: [EventRow]; close: []; cancel: [EventRow] }>()
const m = messages.calendar
const c = messages.connections
// Whether attendees see who else is going (SPEC §10 Connections).
const showGuests = ref(true)

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const title = ref('')
const allDay = ref(false)
const startDate = ref('')
const startTime = ref('09:00')
const endDate = ref('')
const endTime = ref('10:00')
const repeat = ref<EventRepeat>('never')
// Turning All day off fills in a time, so the time boxes are never empty (SPEC §5 Calendar).
watch(allDay, (on) => {
  if (on || startTime.value) return
  startTime.value = nextWholeHour()
  endTime.value = `${String(Math.min(Number(startTime.value.slice(0, 2)) + 1, 23)).padStart(2, '0')}:${startTime.value === '23:00' ? '59' : '00'}`
})
const reminder = ref<number | null>(null)
const notes = ref('')
const error = ref('')
// People to invite when saving (SPEC §5 Shared events).
const people = ref<PersonToInvite[]>([])
// A suggested time when everyone's free (SPEC §10 Connections: scheduling).
function useSuggestion(s: { date: string; start: string; end: string }) {
  allDay.value = false
  startDate.value = s.date
  endDate.value = s.date
  startTime.value = s.start
  endTime.value = s.end
}

watch(
  () => props.event,
  (e) => {
    if (!e) return dialog.value?.close()
    title.value = e.title
    allDay.value = !e.start_time
    startDate.value = e.start_date
    endDate.value = e.end_date
    startTime.value = e.start_time?.slice(0, 5) ?? '09:00'
    endTime.value = e.end_time?.slice(0, 5) ?? '10:00'
    repeat.value = e.repeat
    reminder.value = e.reminder_minutes
    showGuests.value = e.show_guests ?? true
    notes.value = e.notes ?? ''
    error.value = ''
    people.value = []
    dialog.value?.showModal()
  },
)
// Moving the start keeps the end after it.
watch(startDate, (d, before) => {
  if (!before || !endDate.value) return
  if (endDate.value < d) endDate.value = d
})

const draft = computed<EventRow | null>(() =>
  props.event
    ? {
        ...props.event,
        title: title.value.trim(),
        start_date: startDate.value,
        end_date: endDate.value || startDate.value,
        start_time: allDay.value ? null : startTime.value,
        end_time: allDay.value ? null : endTime.value,
        repeat: repeat.value,
        reminder_minutes: reminder.value,
        show_guests: showGuests.value,
        notes: notes.value.trim() || null,
      }
    : null,
)

async function save() {
  const row = draft.value
  if (!row) return
  const problem = eventProblem(row)
  if (problem) {
    error.value = problem === 'title' ? m.editor.titleError : m.editor.endError
    return
  }
  emit('save', row, people.value)
}
function confirmDelete() {
  if (props.event) emit('delete', props.event)
  confirmDialog.value?.close()
}
</script>
