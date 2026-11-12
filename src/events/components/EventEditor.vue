<template>
  <EditorDialog
    :open="!!event"
    :heading="isNew ? m.editor.newHeading : m.editor.heading"
    :save-label="m.editor.save"
    :close-label="m.editor.close"
    :delete-label="isNew ? null : m.editor.delete"
    box-class="m-auto max-h-[92dvh] w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    novalidate
    @save="save"
    @delete="askDelete"
    @close="emit('close')"
  >
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.editor.title }}</span>
      <input v-model="title" maxlength="500" :class="field" @input="error = ''">
    </label>
    <NotesEditor v-model="notes" :label="m.editor.notes" test-id="event-notes" />
    <!-- SPEC §5 Calendar: when it happens, folded into Schedule (open for a new event; its summary says when). -->
    <MoreOptions :title="m.editor.schedule" :summary="scheduleSummary" :start-open="scheduleOpen" test-id="event-schedule">
      <label class="flex items-center justify-between gap-4">
        <span class="font-medium">{{ m.editor.allDay }}</span>
        <input v-model="allDay" type="checkbox" class="size-5 accent-[var(--accent)]">
      </label>
      <fieldset class="grid grid-cols-2 gap-3">
        <legend class="mb-1 text-sm font-medium pb-3">{{ m.editor.start }}</legend>
        <DateInput v-model="startDate" :class="allDay ? 'col-span-2' : ''" :label="m.editor.date" :aria-label="`${m.editor.start} ${m.editor.date}`" required :input-class="field" />
        <TimeInput v-if="!allDay" v-model="startTime" :label="m.editor.time" :aria-label="`${m.editor.start} ${m.editor.time}`" :input-class="field" />
      </fieldset>
      <fieldset class="grid grid-cols-2 gap-3">
        <legend class="mb-1 text-sm font-medium pb-3">{{ m.editor.end }}</legend>
        <DateInput v-model="endDate" :class="allDay ? 'col-span-2' : ''" :label="m.editor.date" :aria-label="`${m.editor.end} ${m.editor.date}`" required :input-class="field" />
        <TimeInput v-if="!allDay" v-model="endTime" :label="m.editor.time" :aria-label="`${m.editor.end} ${m.editor.time}`" :input-class="field" />
      </fieldset>
      <label :class="fieldLabel">
        <span class="pb-2">{{ m.editor.repeat }}</span>
        <select v-model="repeat" :class="field">
          <option v-for="r in REPEATS" :key="r" :value="r">{{ m.repeat[r] }}</option>
        </select>
      </label>
      <label :class="fieldLabel">
        <span class="pb-2">{{ m.editor.reminder }}</span>
        <select v-model="reminder" :class="field">
          <option v-for="r in REMINDERS" :key="String(r)" :value="r">{{ m.reminder(r) }}</option>
        </select>
        <span v-if="allDay && reminder !== null" class="text-xs">{{ m.editor.reminderAllDay }}</span>
      </label>
    </MoreOptions>

    <!-- SPEC §5 Shared events: who's going, then inviting people, folded into Attendees. -->
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
    >
      <label class="flex items-center justify-between gap-4 text-sm">
        <span><span class="font-medium">{{ c.showGuests }}</span><span class="block text-xs text-muted">{{ c.showGuestsHint }}</span></span>
        <input v-model="showGuests" type="checkbox" :class="checkbox">
      </label>
    </EventPeople>
    <p v-if="event?.cancelled_at" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ messages.invites.cancelledNote }}</p>
    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
    <template #actions>
      <button
        v-if="!isNew && event && !event.cancelled_at"
        type="button"
        :class="warningOutline"
        @click="emit('cancel', event)"
      >
        {{ messages.cancelEvent.button }}
      </button>
    </template>
  </EditorDialog>

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
import EditorDialog from '@/components/EditorDialog.vue'
import TimeInput from '@/components/TimeInput.vue'
import DateInput from '@/components/DateInput.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import { storedNotes } from '@/journal/body'
import { computed, ref, watch } from 'vue'
import EventPeople from '@/events/components/EventPeople.vue'
import { useBrainStore } from '@/stores/brain'
import type { PersonToInvite } from '@/events/sharing'
import { eventProblem, nextWholeHour, REMINDERS, REPEATS } from '@/events/rules'
import { messages } from '@/messages'
import type { EventRepeat, EventRow } from '@/sync/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { checkbox, field, fieldLabel, warningOutline } from '@/ui/styles'
import { dayLabel, timeLabel } from '@/ui/dates'

const props = defineProps<{ event: EventRow | null; isNew: boolean; withPeople?: PersonToInvite[] }>()
const emit = defineEmits<{ save: [EventRow, PersonToInvite[]]; delete: [EventRow, boolean]; close: []; cancel: [EventRow] }>()
const brain = useBrainStore()
const m = messages.calendar
const c = messages.connections
// Whether attendees see who else is going (SPEC §10 Connections).
const showGuests = ref(true)

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
// More details opens by itself when something in it is set.
// Schedule starts open for a new event, so its date and time are in view while I set them.
const scheduleOpen = ref(false)
/** "Tue, Nov 10 · 9:00 am – 10:00 am, every week": when it is, shown on the closed Schedule fold-out. */
const scheduleSummary = computed(() => {
  if (!startDate.value) return ''
  const sameDay = !endDate.value || endDate.value === startDate.value
  const when = allDay.value
    ? `${dayLabel(startDate.value)}${sameDay ? '' : ` – ${dayLabel(endDate.value)}`} · ${m.editor.allDay}`
    : `${dayLabel(startDate.value)} · ${timeLabel(startTime.value)} – ${sameDay ? '' : `${dayLabel(endDate.value)} · `}${timeLabel(endTime.value)}`
  return repeat.value === 'never' ? when : `${when}, ${m.repeat[repeat.value].toLowerCase()}`
})
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
    if (!e) return
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
    scheduleOpen.value = props.isNew
    error.value = ''
    people.value = props.isNew ? [...(props.withPeople ?? [])] : []
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
        notes: storedNotes(notes.value),
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
// An event with people invited asks first (it affects them); one without goes straight away, with Undo (SPEC §2).
async function askDelete() {
  const e = props.event
  if (!e) return
  const invites = brain.db ? await brain.db.event_invites.where('event_id').equals(e.id).toArray() : []
  if (invites.some((i) => !i.deleted_at)) confirmDialog.value?.open()
  else emit('delete', e, false)
}
function confirmDelete() {
  if (props.event) emit('delete', props.event, true)
  confirmDialog.value?.close()
}
</script>
