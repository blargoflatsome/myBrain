<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted italic" data-testid="habits-tagline">{{ m.intro }}</p>
    </div>

    <button type="button" class="min-h-12 self-start rounded-xl border border-line bg-surface px-4 font-medium" @click="startNew">
      {{ m.add }}
    </button>

    <p v-if="!habits.length" class="text-muted">{{ m.empty }}</p>

    <section v-if="scheduledToday.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.todayHeading }}</h2>
      <ul class="flex flex-col gap-2">
        <li
          v-for="h in scheduledToday"
          :key="h.id"
          class="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3"
          :data-testid="`habit-${h.id}`"
        >
          <div class="flex items-start gap-3">
            <button
              type="button"
              class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm"
              :class="ring[status(h)]"
              :aria-label="status(h) === 'completed' ? m.undo(h.title) : m.complete(h.title)"
              :aria-pressed="status(h) === 'completed'"
              :disabled="status(h) === 'missed'"
              @click="toggle(h)"
            >
              <span v-if="status(h) === 'completed'" aria-hidden="true">✓</span>
              <span v-else-if="status(h) === 'missed'" aria-hidden="true">✕</span>
            </button>
            <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="edit(h)">
              <span class="text-base break-words" :class="status(h) === 'completed' ? 'text-muted' : ''">{{ h.title }}</span>
              <span class="flex flex-wrap gap-x-3 text-xs text-muted" data-testid="habit-meta">
                <span data-testid="habit-status">{{
                  status(h) === 'completed' ? m.doneToday : status(h) === 'missed' ? m.missedToday : dueText(h)
                }}</span>
                <span data-testid="habit-streak">{{ m.streak(streakOf(h).current) }}</span>
                <span data-testid="habit-best">{{ m.best(streakOf(h).best) }}</span>
                <span v-if="h.is_private">{{ m.privateBadge }}</span>
                <span v-if="h.is_priority" class="text-danger">{{ m.priorityBadge }}</span>
              </span>
            </button>
          </div>
          <p v-if="status(h) === 'missed'" class="text-sm text-muted">{{ m.missedNote }}</p>
          <p v-if="celebrated === h.id" class="text-sm font-medium text-accent" role="status">{{ m.newBest }}</p>
        </li>
      </ul>
    </section>

    <section v-if="notToday.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.notTodayHeading }}</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="h in notToday" :key="h.id">
          <button type="button" class="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-surface p-3 text-left" @click="edit(h)">
            <span>{{ h.title }}</span>
            <span class="flex gap-3 text-xs text-muted">
              <span>{{ h.weekdays.map((d) => m.weekdayNames[d]).join(' ') }}</span>
              <span>{{ m.streak(streakOf(h).current) }}</span>
              <span>{{ m.best(streakOf(h).best) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <HabitEditor :habit="editing" :is-new="isNew" @save="save" @delete="remove" @close="editing = null" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Habits: today's habits with their timer deadlines, streaks and best streaks.
import { computed, onScopeDispose, ref, watch } from 'vue'
import HabitEditor from '@/components/HabitEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useAuthStore } from '@/stores/auth'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { dayStatus, deadline, dueByMidnight, isScheduled, newHabit, streaks } from '@/habits/rules'
import { messages } from '@/messages'
import type { HabitLogRow, HabitRow } from '@/sync/types'
import { live } from '@/sync/live'
import { useRoute, useRouter } from 'vue-router'

const brain = useBrainStore()
const auth = useAuthStore()
const m = messages.habits
const { today, timeZone } = useToday()

const habits = useLiveQuery<HabitRow[]>(
  async () => (brain.db ? live(await brain.db.habits.toArray()) : []),
  [],
  [() => brain.db],
)
const logs = useLiveQuery<HabitLogRow[]>(async () => (brain.db ? brain.db.habit_logs.toArray() : []), [], [() => brain.db])

// A clock that ticks each minute, so a timer running out shows as missed without a reload.
const now = ref(new Date())
const tick = setInterval(() => (now.value = new Date()), 60_000)
onScopeDispose(() => clearInterval(tick))

// Record misses and refresh cached streaks whenever habits, the day or the minute changes.
watch(
  [() => habits.value.map((h) => h.id).join(), today, now, () => brain.habitsReady],
  async () => {
    for (const h of habits.value) await brain.refreshHabit(h, now.value, timeZone.value)
  },
  { immediate: true },
)

const scheduledToday = computed(() => habits.value.filter((h) => isScheduled(h, today.value)))
const notToday = computed(() => habits.value.filter((h) => !isScheduled(h, today.value)))

/** Streaks straight from the logs, so they are right even before the cached numbers are refreshed. */
function streakOf(h: HabitRow) {
  return streaks(h, logs.value, now.value, timeZone.value)
}

function status(h: HabitRow) {
  return dayStatus(h, today.value, logs.value, now.value, timeZone.value)
}
function dueText(h: HabitRow) {
  if (dueByMidnight(h, today.value)) return m.dueToday
  const time = new Date(deadline(h, today.value, timeZone.value)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return m.dueBy(time)
}

const celebrated = ref<string | null>(null)
async function toggle(h: HabitRow) {
  const before = streakOf(h).best
  const kind = await brain.toggleHabit(h, new Date(), timeZone.value)
  now.value = new Date()
  const after = streaks(h, (await brain.db?.habit_logs.toArray()) ?? [], now.value, timeZone.value).best
  celebrated.value = kind === 'complete' && after > before && before > 0 ? h.id : null
}

const editing = ref<HabitRow | null>(null)
const isNew = ref(false)
function startNew() {
  isNew.value = true
  editing.value = newHabit('', auth.user?.id ?? '', timeZone.value)
}
function edit(h: HabitRow) {
  isNew.value = false
  editing.value = h
}
// Opened with ?habit=<id> (from search): open that habit's editor.
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.habit, habits],
  ([id]) => {
    if (typeof id !== 'string') return
    const found = habits.value.find((x) => x.id === id && !x.deleted_at)
    if (!found) return
    edit(found)
    void router.replace({ query: {} })
  },
  { immediate: true },
)
async function save(h: HabitRow) {
  await brain.saveHabit(h)
  editing.value = null
}
async function remove(h: HabitRow) {
  await brain.deleteHabit(h.id)
  editing.value = null
}

const ring = {
  completed: 'border-accent bg-accent text-accent-ink',
  missed: 'border-danger text-danger',
  open: 'border-muted',
  not_scheduled: 'border-line',
} as const
</script>
