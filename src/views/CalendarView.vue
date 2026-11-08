<template>
  <main class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-6 pb-28">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <button type="button" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="startNew(range.from <= today && today <= range.to ? today : range.from, null)">
        {{ m.newEvent }}
      </button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <button type="button" class="flex size-11 items-center justify-center rounded-xl border border-line" :aria-label="m.previous" @click="api()?.prev()">‹</button>
        <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="api()?.today()">{{ m.today }}</button>
        <button type="button" class="flex size-11 items-center justify-center rounded-xl border border-line" :aria-label="m.next" @click="api()?.next()">›</button>
        <h2 class="ml-2 text-lg font-semibold" data-testid="calendar-title">{{ title }}</h2>
      </div>
      <div class="flex rounded-xl border border-line p-1" role="group" :aria-label="m.heading">
        <button
          v-for="v in views"
          :key="v.name"
          type="button"
          class="min-h-9 rounded-lg px-3 text-sm"
          :class="view === v.name ? 'bg-accent font-semibold text-accent-ink' : 'text-muted'"
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
    <EventEditor :event="editing" :is-new="isNew" @save="saveEvent" @delete="deleteEvent" @cancel="startCancel" @close="editing = null" />
    <InvitedEventDialog :event="viewing" :invite="viewingInvite" @drop-out="startDropOut" @close="viewing = null" />
    <CancelEventDialog :event="cancelling" :mode="cancelMode" @done="cancelled" @close="cancelling = null" />
    <ShareFlow v-if="shareTargets.length" :targets="shareTargets" :kind="shareKind" @done="shareTargets = []" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Calendar and reminders: month, week and day views of my dated tasks, priority tasks and events.
// Tap a day or time (or "+ New event") to add an event; tap an item to open it.
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
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
import EventEditor from '@/components/EventEditor.vue'
import InvitedEventDialog from '@/components/InvitedEventDialog.vue'
import CancelEventDialog from '@/components/CancelEventDialog.vue'
import ShareFlow from '@/components/ShareFlow.vue'
import { invitePeople, inviteLink, inviteMessage, type PersonToInvite, type ShareTarget } from '@/events/sharing'
import { supabase } from '@/lib/supabase'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { calendarItems, newEvent, type CalendarItem } from '@/events/rules'
import { addDays } from '@/tasks/days'
import { messages } from '@/messages'
import type { EventInviteRow, EventRow } from '@/sync/types'
import { live } from '@/sync/live'

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
const view = ref<ViewName>(window.matchMedia('(min-width: 768px)').matches ? 'dayGridMonth' : 'timeGridDay')
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

// Dark mode follows the system, like the rest of the app.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const scheme = ref(dark.matches ? 'dark' : 'light')
const onScheme = () => (scheme.value = dark.matches ? 'dark' : 'light')
dark.addEventListener('change', onScheme)
onScopeDispose(() => dark.removeEventListener('change', onScheme))

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
    const { kind, itemId } = info.event.extendedProps as CalendarItem['extendedProps']
    if (kind === 'task') void router.push({ name: 'home', query: { task: itemId } })
    else if (kind === 'priority_task') void router.push({ name: 'home', query: { priority: itemId } })
    else openEvent(itemId)
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
function startNew(date: string, time: string | null) {
  isNew.value = true
  editing.value = newEvent(brain.userId ?? '', date, time)
}
// Invitations I received (SPEC §5): my own invite rows, read-only.
const myInvites = useLiveQuery<EventInviteRow[]>(async () => (brain.db ? brain.db.event_invites.toArray() : []), [], [() => brain.db])
const viewing = ref<EventRow | null>(null)
const viewingInvite = computed(() => (viewing.value ? (myInvites.value.find((i) => i.event_id === viewing.value!.id && !i.deleted_at) ?? null) : null))

function openEvent(id: string) {
  const e = events.value.find((x) => x.id === id)
  if (!e) return
  // Someone else's event I was invited to opens read-only; my own opens the editor.
  if (e.user_id && brain.userId && e.user_id !== brain.userId) {
    viewing.value = e
    return
  }
  isNew.value = false
  editing.value = e
}

// ---------- Inviting, and reaching guests one at a time (SPEC §5 Shared events) ----------
const inviteError = ref('')
const shareTargets = ref<ShareTarget[]>([])
const shareKind = ref<'invite' | 'cancel'>('invite')
async function myName() {
  const { data } = await supabase.from('profiles').select('display_name').eq('user_id', brain.userId ?? '').maybeSingle()
  return data?.display_name || 'A friend'
}
async function saveEvent(e: EventRow, people: PersonToInvite[] = []) {
  await brain.saveEvent(e)
  editing.value = null
  inviteError.value = ''
  if (!people.length) return
  if (!brain.online) return (inviteError.value = messages.invites.offline)
  try {
    await brain.refresh(['events'])
    const created = await invitePeople(e.id, people)
    const host = await myName()
    shareKind.value = 'invite'
    shareTargets.value = created
      .filter((c) => c.token && (c.email || c.phone))
      .map((c) => ({ inviteId: c.invite_id, name: c.name, email: c.email, phone: c.phone, ...inviteMessage(host, c.name, e, inviteLink(c.invite_id, c.token!)) }))
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
async function deleteEvent(e: EventRow) {
  await brain.deleteEvent(e.id)
  editing.value = null
}

// Opened with ?date= (a reminder or search) and maybe ?event= (search): go there and open the event.
watch(
  [() => route.query.event, events],
  ([id]) => {
    if (typeof id !== 'string' || editing.value) return
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
