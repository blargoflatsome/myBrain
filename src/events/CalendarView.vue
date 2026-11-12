<template>
  <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <NewButton :label="m.newEvent" data-testid="new-event" @click="startNew(range.from <= today && today <= range.to ? today : range.from, null)" />
    </div>

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

    <p v-if="inviteError" class="text-sm text-danger" role="alert">{{ inviteError }}</p>
    <p v-if="inviteNotice" class="rounded-xl border border-line bg-surface p-3 text-sm" role="status" data-testid="invite-notice">{{ inviteNotice }}</p>
    <CalendarItemDialog :item="viewItem" @edit="editItem" @close="viewItem = null" />
    <TaskEditor :task="editingTask" @save="saveTask" @delete="deleteTask" @close="editingTask = null" />
    <PriorityTasks editor-only :open-id="editPriority" @opened="editPriority = null" />
    <EventEditor :event="editing" :is-new="isNew" @save="saveEvent" @delete="deleteEvent" @cancel="startCancel" @close="editing = null" />
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
// SPEC §5 Calendar and reminders: month, week and day views of my dated tasks, priority tasks and events.
// Tap a day or time (or "+ New event") to add an event; tap an item to open it.
import { useProfileStore } from '@/stores/profile'
import { computed, onMounted, ref, watch } from 'vue'
import { isDark } from '@/ui/appearance'
import { useRoute, useRouter } from 'vue-router'
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
import PriorityTasks from '@/reminders/components/PriorityTasks.vue'
import InvitedEventDialog from '@/events/components/InvitedEventDialog.vue'
import CancelEventDialog from '@/events/components/CancelEventDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { eventChanged } from '@/connections/connections'
import ShareFlow from '@/events/components/ShareFlow.vue'
import { invitePeople, inviteLink, inviteMessage, type PersonToInvite, type ShareTarget } from '@/events/sharing'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { calendarItems, newEvent, nextWholeHour, type CalendarItem } from '@/events/rules'
import { addDays } from '@/tasks/days'
import { messages } from '@/messages'
import type { EventInviteRow, EventRow, PriorityTaskRow, TaskRow } from '@/sync/types'
import { live } from '@/sync/live'
import { useUndoStore } from '@/stores/undo'
import { selected, smallButton } from '@/ui/styles'
import NewButton from '@/components/NewButton.vue'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
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

const events = useLiveQuery<EventRow[]>(async () => (brain.db ? live(await brain.db.events.toArray()) : []), [], [() => brain.db])
const items = useLiveQuery<CalendarItem[]>(
  async () => {
    const db = brain.db
    if (!db) return []
    return calendarItems(
      {
        tasks: await db.tasks.toArray(),
        priorityTasks: await db.priority_tasks.toArray(),
        events: await db.events.toArray(),
        invites: await db.event_invites.toArray(),
        me: brain.userId,
      },
      range.value.from,
      range.value.to,
    )
  },
  [],
  [() => brain.db, range],
)
const emptyDay = computed(() => view.value === 'timeGridDay' && !items.value.some((i) => i.start.slice(0, 10) <= range.value.from && (i.end ?? i.start).slice(0, 10) >= range.value.from))

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
  events: items.value,
  dateClick: (info: DateClickInfo) => startNew(info.dateStr.slice(0, 10), info.allDay ? null : info.dateStr.slice(11, 16)),
  eventClick: (info: EventClickInfo) => {
    info.jsEvent.preventDefault()
    const { kind, itemId, date } = info.event.extendedProps as CalendarItem['extendedProps']
    if (kind === 'task') {
      const row = tasks.value.find((t) => t.id === itemId)
      if (row) viewItem.value = { kind, title: row.title, date, row }
    } else if (kind === 'priority_task') {
      const row = priorityTasks.value.find((p) => p.id === itemId)
      if (row) viewItem.value = { kind, title: row.title, date, row }
    } else openEvent(itemId, date)
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
function startNew(date: string, time: string | null) {
  isNew.value = true
  editing.value = newEvent(brain.userId ?? '', date, time ?? nextWholeHour())
}
// Invitations I received (SPEC §5): my own invite rows, read-only.
const myInvites = useLiveQuery<EventInviteRow[]>(async () => (brain.db ? brain.db.event_invites.toArray() : []), [], [() => brain.db])
const viewing = ref<EventRow | null>(null)
const viewingInvite = computed(() => (viewing.value ? (myInvites.value.find((i) => i.event_id === viewing.value!.id && !i.deleted_at) ?? null) : null))

function openEvent(id: string, date?: string) {
  const e = events.value.find((x) => x.id === id)
  if (!e) return
  // Someone else's event I was invited to opens with its answers; my own opens read-only, with Edit.
  if (e.user_id && brain.userId && e.user_id !== brain.userId) {
    viewing.value = e
    return
  }
  viewItem.value = { kind: 'event', title: e.title, date: date ?? e.start_date, row: e }
}

// ---------- Viewing my own items read-only, then editing them here (SPEC §5 Calendar) ----------
const tasks = useLiveQuery<TaskRow[]>(async () => (brain.db ? live(await brain.db.tasks.toArray()) : []), [], [() => brain.db])
const priorityTasks = useLiveQuery<PriorityTaskRow[]>(async () => (brain.db ? live(await brain.db.priority_tasks.toArray()) : []), [], [() => brain.db])
const viewItem = ref<CalendarView | null>(null)
const editingTask = ref<TaskRow | null>(null)
const editPriority = ref<string | null>(null)
function editItem(item: CalendarView) {
  viewItem.value = null
  if (item.kind === 'task') editingTask.value = item.row
  else if (item.kind === 'priority_task') editPriority.value = item.row.id
  else {
    isNew.value = false
    editing.value = item.row
  }
}
async function saveTask(t: TaskRow) {
  await brain.saveTask(t)
  editingTask.value = null
}
async function deleteTask(t: TaskRow) {
  await brain.remove('tasks', t.id)
  editingTask.value = null
  undo.offer(messages.undo.deleted(t.title), () => brain.restore('tasks', t.id))
}
const undo = useUndoStore()

// ---------- Inviting, and reaching guests one at a time (SPEC §5 Shared events) ----------
const inviteError = ref('')
const inviteNotice = ref('')
function shared(sent: number) {
  if (shareKind.value === 'invite') inviteNotice.value = messages.invites.shared(sent, shareTargets.value.length)
  shareTargets.value = []
}
const shareTargets = ref<ShareTarget[]>([])
const shareKind = ref<'invite' | 'cancel' | 'update'>('invite')
async function myName() {
  return (await useProfileStore().load())?.display_name || 'A friend'
}
// Changing the date or time of an event people are invited to offers to let them know (SPEC §10 Connections).
const cm = messages.connections
const confirmNotify = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const changedEvent = ref<EventRow | null>(null)
// Times come back from the server as 19:00:00 and from the editor as 19:00.
const when = (x: EventRow) => [x.start_date, x.start_time?.slice(0, 5), x.end_date, x.end_time?.slice(0, 5), x.repeat].join('|')
async function offerChangeNotice(before: EventRow | undefined, e: EventRow) {
  if (!before || when(before) === when(e) || !brain.db) return
  const invites = await brain.db.event_invites.where('event_id').equals(e.id).toArray()
  if (!invites.some((i) => !i.deleted_at && i.response !== 'no' && i.response !== 'dropped')) return
  changedEvent.value = e
  confirmNotify.value?.open()
}
async function notifyChange() {
  const e = changedEvent.value
  confirmNotify.value?.close()
  if (!e) return
  if (!brain.online) return (inviteError.value = messages.invites.offline)
  try {
    const recipients = await eventChanged(e.id)
    const targets = recipients.map((r) => ({ inviteId: r.invite_id, name: r.name, email: r.email, phone: r.phone, subject: `${e.title} has changed`, body: r.body }))
    if (targets.length) {
      shareKind.value = 'update'
      shareTargets.value = targets
    }
  } catch (err) {
    inviteError.value = messages.invites.failed(err instanceof Error ? err.message : String(err))
  }
}

async function saveEvent(e: EventRow, people: PersonToInvite[] = []) {
  const before = isNew.value ? undefined : events.value.find((x) => x.id === e.id)
  await brain.saveEvent(e)
  void offerChangeNotice(before, e)
  // Everyone I typed joins my people, to pick from next time (SPEC §5 Calendar).
  await brain.savePeople(people)
  editing.value = null
  inviteError.value = ''
  inviteNotice.value = ''
  if (!people.length) return
  if (!brain.online) return (inviteError.value = messages.invites.offline)
  try {
    await brain.refresh(['events'])
    const created = await invitePeople(e.id, people)
    const host = await myName()
    shareKind.value = 'invite'
    const targets = created
      .filter((c) => c.token && (c.email || c.phone))
      .map((c) => ({ inviteId: c.invite_id, name: c.name, email: c.email, phone: c.phone, ...inviteMessage(host, c.name, e, inviteLink(c.invite_id, c.token!)) }))
    const inApp = created.length - targets.length
    inviteNotice.value = [targets.length ? messages.invites.ready(targets.length) : '', inApp ? messages.invites.inApp(inApp) : ''].filter(Boolean).join(' ')
    shareTargets.value = targets
    await brain.refresh(['event_invites'])
  } catch (err) {
    inviteError.value = messages.invites.failed(err instanceof Error ? err.message : String(err))
  }
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
  await brain.remove('events', e.id)
  editing.value = null
  // Without guests it went straight away, so it can come back (SPEC §2 Undo).
  if (!confirmed) undo.offer(messages.undo.deleted(e.title), () => brain.restore('events', e.id))
}

// Opened with ?date= (a reminder or search) and maybe ?event= (search): go there and open the event.
watch(
  [() => route.query.event, events],
  ([id]) => {
    if (typeof id !== 'string' || editing.value || viewItem.value) return
    if (events.value.some((e) => e.id === id)) {
      openEvent(id)
      void router.replace({ query: { date: route.query.date } })
    }
  },
  { immediate: true },
)
onMounted(() => {
  if (typeof route.query.date === 'string') api()?.gotoDate(route.query.date)
})
</script>
