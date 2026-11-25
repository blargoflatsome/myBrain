<template>
  <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" :class="smallButton" data-testid="open-availability" @click="availabilityDialog?.showModal()">{{ messages.availability.open }}</button>
        <NewButton :label="m.newEvent" data-testid="new-event" @click="startNew(range.from <= today && today <= range.to ? today : range.from, null)" />
      </div>
    </div>
    <!-- SPEC §2 Undo in place: a deleted event or task has no row here to stand in, so its Undo goes under the heading. -->
    <UndoLine v-for="l in undoable.ownLines()" :key="l.key" :line="l" tag="p" @undo="(el) => undoable.run(l, el)" />

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <button type="button" class="flex size-11 items-center justify-center rounded-xl border border-line" :aria-label="m.previous" @click="api()?.prev()">‹</button>
        <button type="button" :class="smallButton" @click="api()?.today()">{{ m.today }}</button>
        <button type="button" class="flex size-11 items-center justify-center rounded-xl border border-line" :aria-label="m.next" @click="api()?.next()">›</button>
        <h2 class="ml-2 text-lg font-semibold" data-testid="calendar-title">{{ title }}</h2>
      </div>
      <div class="flex rounded-xl border border-line p-1" role="group" :aria-label="m.heading">
        <button
          v-for="v in views"
          :key="v.name"
          type="button"
          class="min-h-9 rounded-lg px-3 text-sm"
          :class="view === v.name ? [selected, 'border'] : 'border border-transparent text-muted'"
          :aria-pressed="view === v.name"
          @click="changeView(v.name)"
        >
          {{ v.label }}
        </button>
      </div>
    </div>

    <div class="cal-wrap rounded-2xl border border-line bg-surface p-2">
      <FullCalendar ref="calendar" :options="options" />
    </div>
    <p v-if="emptyDay" class="text-muted" data-testid="calendar-empty">{{ m.emptyDay }}</p>
    <!-- SPEC §10 Scheduler: the shading in Week and Day is the times I'm not available; said in words too. -->
    <p v-if="view !== 'dayGridMonth' && unavailable.length" class="flex items-center gap-2 text-sm text-muted" data-testid="unavailable-key">
      <span class="unavailable-swatch size-4 shrink-0 rounded" aria-hidden="true" />{{ messages.availability.shadingKey }}
    </p>
    <dialog ref="availabilityDialog" :class="dialogBox" :aria-label="messages.availability.open" data-testid="availability-dialog">
      <div class="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-5">
        <h2 class="pr-10 text-xl font-bold">{{ messages.availability.open }}</h2>
        <AvailabilityCard />
      </div>
      <CloseX @click="availabilityDialog?.close()" />
    </dialog>

    <p v-if="inviteError" class="text-sm text-danger" role="alert">{{ inviteError }}</p>
    <p v-if="inviteNotice" class="rounded-xl border border-line bg-surface p-3 text-sm" role="status" data-testid="invite-notice">{{ inviteNotice }}</p>
    <CalendarItemDialog :item="viewItem" @edit="editItem" @close="viewItem = null" />
    <TaskEditor :task="editingTask" @save="saveTask" @delete="deleteTask" @close="editingTask = null" />
    <EventEditor :event="editing" :is-new="isNew" :with-people="startPeople" @save="saveEvent" @delete="deleteEvent" @cancel="startCancel" @close="editing = null" />
    <InvitedEventDialog :event="viewing" :invite="viewingInvite" @drop-out="startDropOut" @close="viewing = null" />
    <CancelEventDialog :event="cancelling" :mode="cancelMode" @done="cancelled" @close="cancelling = null" />
    <ConfirmDialog
      ref="confirmNotify"
      :heading="cm.letEveryoneKnow.heading"
      :body="cm.letEveryoneKnow.body"
      :confirm-label="cm.letEveryoneKnow.confirm"
      :keep-label="cm.letEveryoneKnow.keep"
      @confirm="notifyChange"
      @close="changedEvent = null"
    />
    <ShareFlow v-if="shareTargets.length" :targets="shareTargets" :kind="shareKind" @done="shared" />
  </main>
</template>

<script setup lang="ts">
import { useOpenLinked } from '@/router/links'
// SPEC §5 Calendar and reminders: month, week and day views of my dated tasks and events.
// Tap a day or time (or "+ New event") to add an event; tap an item to open it.
import { readTables } from '@/sync/db'
import { useRows, useDeviceQuery, findRow } from '@/sync/useRows'
import { computed, onMounted, ref, watch } from 'vue'
import { isDark } from '@/ui/appearance'
import { useRoute } from 'vue-router'
import FullCalendar from '@fullcalendar/vue3'
import classicTheme from '@fullcalendar/vue3/themes/classic'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import timeGridPlugin from '@fullcalendar/vue3/timegrid'
import interactionPlugin from '@fullcalendar/vue3/interaction'
import '@fullcalendar/vue3/skeleton.css'
import '@fullcalendar/vue3/themes/classic/theme.css'
import '@fullcalendar/vue3/themes/classic/palette.css'
import type { CalendarOptions, DateClickInfo, DatesSetInfo, EventClickInfo } from '@fullcalendar/vue3'
import EventEditor from '@/events/components/EventEditor.vue'
import CalendarItemDialog, { type CalendarView } from '@/events/components/CalendarItemDialog.vue'
import TaskEditor from '@/tasks/components/TaskEditor.vue'
import InvitedEventDialog from '@/events/components/InvitedEventDialog.vue'
import CancelEventDialog from '@/events/components/CancelEventDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ShareFlow from '@/events/components/ShareFlow.vue'
import type { PersonToInvite, ShareTarget } from '@/events/sharing'
import { sayWhy } from '@/server/server'
import { takeStartWith } from '@/events/startWith'
import { useBrainStore } from '@/stores/brain'
import { useToday } from '@/composables/useToday'
import { calendarItems, myPlace, newEvent, nextWholeHour, shownToMe, type CalendarItem } from '@/events/rules'
import { addDays } from '@/time/days'
import { messages } from '@/messages'
import type { EventRow, TaskRow } from '@/sync/types'
import UndoLine from '@/components/UndoLine.vue'
import { useUndoInPlace } from '@/composables/useUndoInPlace'
import { dialogBox, selected, smallButton } from '@/ui/styles'
import NewButton from '@/components/NewButton.vue'
import CloseX from '@/components/CloseX.vue'
import AvailabilityCard from '@/events/components/AvailabilityCard.vue'
import { myUnavailable } from '@/events/availability'

const brain = useBrainStore()
const route = useRoute()
const m = messages.calendar
const { today } = useToday()

type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
const views: { name: ViewName; label: string }[] = [
  { name: 'dayGridMonth', label: m.views.month },
  { name: 'timeGridWeek', label: m.views.week },
  { name: 'timeGridDay', label: m.views.day },
]
const calendar = ref<InstanceType<typeof FullCalendar> | null>(null)
const api = () => calendar.value?.getApi()
// The calendar opens on the month (SPEC §5 Calendar).
const view = ref<ViewName>('dayGridMonth')
const title = ref('')
const range = ref<{ from: string; to: string }>({ from: today.value, to: today.value })

const events = useRows('events')
const items = useDeviceQuery<CalendarItem[]>(
  async (db, me) => calendarItems({ ...(await readTables(db, { tasks: 'tasks', events: 'events', invites: 'event_invites' })), me }, range.value.from, range.value.to),
  [],
  [range],
)
const emptyDay = computed(() => view.value === 'timeGridDay' && !items.value.some((i) => i.start.slice(0, 10) <= range.value.from && (i.end ?? i.start).slice(0, 10) >= range.value.from))

// SPEC §10 Scheduler: my not-available times, shaded in Week and Day (never shown to anyone else).
const availabilityDialog = ref<HTMLDialogElement | null>(null)
const myRules = useRows('availability_rules')
const myExceptions = useRows('availability_exceptions')
const unavailable = computed(() => (view.value === 'dayGridMonth' ? [] : myUnavailable(myRules.value, myExceptions.value, range.value.from, range.value.to)))
const shading = computed(() => unavailable.value.map((b) => ({ start: b.start, end: b.end, display: 'background', className: 'unavailable' })))

// Dark or light like the rest of the app (SPEC §3 Appearance).
const scheme = computed(() => (isDark.value ? 'dark' : 'light'))

const options = computed<CalendarOptions>(() => ({
  plugins: [classicTheme, dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: view.value,
  initialDate: typeof route.query.date === 'string' ? route.query.date : undefined,
  headerToolbar: false,
  height: 'auto',
  firstDay: 0,
  nowIndicator: true,
  dayMaxEvents: 3,
  scrollTime: '07:00:00',
  colorScheme: scheme.value,
  events: [...items.value, ...shading.value],
  dateClick: (info: DateClickInfo) => startNew(info.dateStr.slice(0, 10), info.allDay ? null : info.dateStr.slice(11, 16)),
  // The tapped row is read when tapped: the calendar can show an item before a list of my rows has arrived.
  eventClick: async (info: EventClickInfo) => {
    info.jsEvent.preventDefault()
    const { kind, itemId, date } = info.event.extendedProps as CalendarItem['extendedProps']
    if (kind === 'task') {
      const row = await findRow('tasks', itemId)
      if (row) viewItem.value = { kind, title: row.title, date, row }
    } else {
      const row = await findRow('events', itemId)
      if (row) openEvent(row, date)
    }
  },
  datesSet: (info: DatesSetInfo) => {
    title.value = info.view.title
    // FullCalendar's end is exclusive.
    range.value = { from: info.startStr.slice(0, 10), to: addDays(info.endStr.slice(0, 10), -1) }
  },
}))

function changeView(name: ViewName) {
  view.value = name
  api()?.changeView(name)
}

// ---------- Events ----------
const editing = ref<EventRow | null>(null)
const isNew = ref(false)
// A new event starts at a time (the next whole hour, or the time tapped); All day is something I turn on (SPEC §5).
// Someone already added to a new event (SPEC §5 Profiles: New event from a connection's profile).
const startPeople = ref<PersonToInvite[]>([])
function startNew(date: string, time: string | null, people: PersonToInvite[] = []) {
  startPeople.value = people
  isNew.value = true
  editing.value = newEvent(brain.userId ?? '', date, time ?? nextWholeHour())
}
// Invitations I received (SPEC §5): my own invite rows, read-only.
const myInvites = useRows('event_invites')
const viewing = ref<EventRow | null>(null)
const viewingInvite = computed(() => (viewing.value ? (myInvites.value.find((i) => i.event_id === viewing.value!.id && !i.deleted_at) ?? null) : null))

function openEvent(e: EventRow, date?: string) {
  // Someone else's event I was invited to opens with its answers; my own opens read-only, with Edit.
  if (myPlace(e, myInvites.value, brain.userId) !== 'mine') {
    viewing.value = e
    return
  }
  viewItem.value = { kind: 'event', title: e.title, date: date ?? e.start_date, row: e }
}

// ---------- Viewing my own items read-only, then editing them here (SPEC §5 Calendar) ----------
const viewItem = ref<CalendarView | null>(null)
const editingTask = ref<TaskRow | null>(null)
function editItem(item: CalendarView) {
  viewItem.value = null
  if (item.kind === 'task') editingTask.value = item.row
  else {
    isNew.value = false
    editing.value = item.row
  }
}
async function saveTask(t: TaskRow, tags: string[]) {
  await brain.saveTask(t, tags)
  editingTask.value = null
}
async function deleteTask(t: TaskRow) {
  const putBack = await brain.deleteTask(t.id)
  editingTask.value = null
  undoable.offer(messages.undo.deleted(t.title), putBack)
}
const undoable = useUndoInPlace()

// ---------- Inviting, and reaching guests one at a time (SPEC §5 Shared events) ----------
const inviteError = ref('')
const inviteNotice = ref('')
function shared(sent: number) {
  if (shareKind.value === 'invite') inviteNotice.value = messages.invites.shared(sent, shareTargets.value.length)
  shareTargets.value = []
}
const shareTargets = ref<ShareTarget[]>([])
const shareKind = ref<'invite' | 'cancel' | 'update'>('invite')
// Changing the date or time of an event people are invited to offers to let them know (SPEC §10 Connections).
const cm = messages.connections
const confirmNotify = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const changedEvent = ref<EventRow | null>(null)
async function notifyChange() {
  const e = changedEvent.value
  confirmNotify.value?.close()
  if (!e) return
  try {
    const targets = await brain.tellEventChanged(e)
    if (targets.length) {
      shareKind.value = 'update'
      shareTargets.value = targets
    }
  } catch (err) {
    inviteError.value = sayWhy(err, { offline: messages.invites.offline, limit: messages.invites.changeFailed, failed: messages.invites.changeFailed })
  }
}

async function saveEvent(e: EventRow, people: PersonToInvite[] = []) {
  const saved = await brain.saveEventWithPeople(e, people)
  editing.value = null
  inviteError.value = ''
  inviteNotice.value = ''
  if (saved.offerChangeNotice) {
    changedEvent.value = saved.event
    confirmNotify.value?.open()
  }
  if (saved.inviteFailed) {
    inviteError.value = { offline: messages.invites.offline, limit: messages.invites.overLimit, failed: messages.invites.failed }[saved.inviteFailed]
    return
  }
  if (!people.length) return
  shareKind.value = 'invite'
  inviteNotice.value = [saved.toMessage.length ? messages.invites.ready(saved.toMessage.length) : '', saved.inApp ? messages.invites.inApp(saved.inApp) : ''].filter(Boolean).join(' ')
  shareTargets.value = saved.toMessage
}

// ---------- Cancel and notify / drop out ----------
const cancelling = ref<EventRow | null>(null)
const cancelMode = ref<'cancel' | 'drop'>('cancel')
function startCancel(e: EventRow) {
  editing.value = null
  cancelMode.value = 'cancel'
  cancelling.value = e
}
function startDropOut(e: EventRow) {
  viewing.value = null
  cancelMode.value = 'drop'
  cancelling.value = e
}
function cancelled(targets: ShareTarget[]) {
  cancelling.value = null
  if (targets.length) {
    shareKind.value = 'cancel'
    shareTargets.value = targets
  }
}
async function deleteEvent(e: EventRow, confirmed = false) {
  const putBack = await brain.deleteEvent(e.id)
  editing.value = null
  // Without guests it went straight away, so it can come back (SPEC §2 Undo).
  if (!confirmed) undoable.offer(messages.undo.deleted(e.title), putBack)
}

// Opened from a link: ?date= (a reminder or search) goes to that day, also when the calendar is already open, and
// ?event= opens the event on its own day (alerts' links name only the event).
// A link to an event I said No to or dropped out of opens nothing (SPEC §5 Shared events).
const shownEvents = computed(() => events.value.filter((e) => shownToMe(e, myInvites.value, brain.userId)))
useOpenLinked('event', shownEvents, (e) => {
  // An event being edited stays open; one only being looked at gives way to the link.
  if (editing.value) return
  if (typeof route.query.date !== 'string') api()?.gotoDate(e.start_date)
  openEvent(e)
}, (query) => ({ date: query.date }))
watch(() => route.query.date, (date) => {
  if (typeof date === 'string') api()?.gotoDate(date)
})
onMounted(() => {
  if (typeof route.query.date === 'string') api()?.gotoDate(route.query.date)
  const person = takeStartWith()
  if (person) startNew(today.value, null, [person])
})
</script>
