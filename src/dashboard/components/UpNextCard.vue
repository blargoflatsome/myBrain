<template>
  <!-- SPEC §5 Dashboard Up next: one suggestion at a time, never a list. -->
  <section :class="card" data-testid="up-next" aria-labelledby="up-next-heading">
    <h2 id="up-next-heading" class="text-sm font-semibold text-muted">{{ u.heading }}</h2>
    <div class="flex min-w-0 flex-col gap-1" aria-live="polite">
      <p v-if="reason" class="text-sm text-muted" data-testid="up-next-reason">{{ reason }}</p>
      <p class="text-xl font-semibold break-words" data-testid="up-next-title">{{ title }}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <template v-if="current?.kind === 'stuck_task'">
        <button type="button" :class="primaryButton" data-testid="up-next-today" @click="moveStuck(today)">{{ u.today }}</button>
        <button type="button" :class="secondaryButton" data-testid="up-next-undated" @click="moveStuck(null)">{{ m.undated }}</button>
        <button type="button" :class="secondaryButton" data-testid="up-next-cancel" @click="cancelStuck">{{ messages.tasks.cancel }}</button>
      </template>
      <button v-else type="button" :class="primaryButton" data-testid="up-next-do" @click="doIt">{{ action }}</button>
      <button v-if="current" type="button" :class="secondaryButton" data-testid="up-next-skip" @click="skip">{{ u.somethingElse }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard Up next: the first thing worth doing now (see upNext.ts for the order). The main button does it
// here where it can, otherwise opens the right page; Something else skips it for today, on this device.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { readTables } from '@/sync/db'
import { DAY_TABLES } from '@/journal/stats'
import { useBrainStore } from '@/stores/brain'
import { useProfileStore } from '@/stores/profile'
import { useUndoStore } from '@/stores/undo'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useNow } from '@/composables/useNow'
import { useToday } from '@/composables/useToday'
import { KEEP_GOING_DAYS, skippedToday, upNext, type Suggestion } from '@/dashboard/upNext'
import { cancelTask, moveTask, toggleDone } from '@/tasks/rules'
import { messages } from '@/messages'
import { timeLabel } from '@/ui/dates'
import { readJson, writeJson } from '@/ui/storage'
import { card, primaryButton, secondaryButton } from '@/ui/styles'

const m = messages.dashboard
const u = m.upNext
const brain = useBrainStore()
const undo = useUndoStore()
const router = useRouter()
const now = useNow()
const { today, timeZone } = useToday()

// My journal reminder time, when the server answers (offline: 7 pm).
const journalTime = ref<string | null>(null)
void useProfileStore()
  .load()
  .then((p) => {
    journalTime.value = p?.journal_reminder_time ?? null
  })

const suggestions = useLiveQuery(
  async () => {
    const db = brain.db
    if (!db) return []
    const day = await readTables(db, DAY_TABLES)
    const rest = await readTables(db, { events: 'events', invites: 'event_invites', inbox: 'inbox', journal: 'journal_entries' })
    return upNext({ ...day, ...rest, me: brain.userId }, now.value, timeZone.value, journalTime.value)
  },
  [] as Suggestion[],
  [() => brain.db, now, today, journalTime],
)

// Skipped suggestions, kept for today on this device.
const SKIP_KEY = 'my-brain:up-next-skipped'
const saved = ref<{ date: string; keys: string[] } | null>(readJson(SKIP_KEY))
const skipped = computed(() => skippedToday(saved.value, today.value))
const left = computed(() => suggestions.value.filter((s) => !skipped.value.includes(s.key)))
const current = computed<Suggestion | null>(() => left.value[0] ?? null)
const allSkipped = computed(() => !current.value && suggestions.value.length > 0)

function saveSkips(keys: string[]) {
  saved.value = { date: today.value, keys }
  writeJson(SKIP_KEY, saved.value)
}
function skip() {
  if (current.value) saveSkips([...skipped.value, current.value.key])
}

const title = computed(() => {
  const s = current.value
  if (!s) return allSkipped.value ? u.allSkippedTitle : u.doneTitle
  if (s.kind === 'orphans') return u.orphansTitle(s.count)
  if (s.kind === 'journal') return u.journalTitle
  return s.title
})
const clock = (ms: number) => {
  const d = new Date(ms)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone.value, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return timeLabel(parts)
}
const reason = computed(() => {
  const s = current.value
  if (!s) return ''
  switch (s.kind) {
    case 'priority_habit':
    case 'priority_task':
      return u.priority
    case 'habit':
      return s.streak >= KEEP_GOING_DAYS ? u.keepGoing(s.streak, clock(s.by)) : u.dueBy(clock(s.by))
    case 'routine':
      return s.started ? u.routineStarted : u.routine
    case 'event':
      return u.event(timeLabel(s.time))
    case 'stuck_task':
      return u.stuck(s.times)
    case 'task':
      return u.task
    case 'orphans':
      return u.orphans
    case 'journal':
      return u.journal
  }
  return ''
})
const action = computed(() => {
  const s = current.value
  if (!s) return allSkipped.value ? u.showSkipped : u.pickQuest
  if (s.kind === 'routine') return s.started ? u.carryOn : u.startRoutine
  if (s.kind === 'event') return u.openEvent
  if (s.kind === 'orphans') return u.sortThem
  if (s.kind === 'journal') return u.write
  return u.doIt
})

async function doIt() {
  const s = current.value
  const db = brain.db
  if (!s) {
    if (allSkipped.value) saveSkips([])
    else await router.push({ name: 'quests' })
    return
  }
  if (!db) return
  switch (s.kind) {
    case 'priority_habit':
    case 'habit': {
      const habit = await db.habits.get(s.id)
      if (habit) await brain.toggleHabit(habit)
      return
    }
    case 'priority_task':
      return brain.completePriority({ kind: 'priority_task', id: s.id, title: s.title, description: null, date: s.date })
    case 'task': {
      const task = await db.tasks.get(s.id)
      if (task) await brain.saveTask(toggleDone(task))
      return
    }
    case 'routine':
      return router.push({ name: 'routine-run', params: { id: s.id } })
    case 'event':
      return router.push({ name: 'calendar', query: { date: s.date, event: s.id } })
    case 'orphans':
      return router.push({ name: 'inbox' })
    case 'journal':
      return router.push({ name: 'journal' })
  }
}

// A task carried over 3+ times: Today, Undated or Cancel task, each with Undo (SPEC §5 Dashboard).
async function stuckTask() {
  const s = current.value
  return s?.kind === 'stuck_task' ? brain.db?.tasks.get(s.id) : undefined
}
async function moveStuck(dueDate: string | null) {
  const task = await stuckTask()
  if (!task) return
  await brain.saveTask(moveTask(task, dueDate))
  undo.offer(dueDate ? messages.undo.movedToday(task.title) : messages.undo.movedUndated(task.title), () => brain.saveTask(task))
}
async function cancelStuck() {
  const task = await stuckTask()
  if (!task) return
  await brain.saveTask(cancelTask(task))
  undo.offer(messages.undo.cancelled(task.title), () => brain.saveTask(task))
}
</script>
