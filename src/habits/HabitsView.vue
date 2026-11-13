<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <PageHeading :heading="m.heading" :intro="m.intro" intro-test-id="habits-tagline">
      <NewButton :label="m.add" data-testid="new-habit" @click="startNew" />
    </PageHeading>

    <p v-if="!habits.length" class="text-muted">{{ m.empty }}</p>
    <!-- SPEC §5 Habits: Pause all streaks says so here, in one muted line. -->
    <p v-else-if="pausedNow" class="text-muted" data-testid="habits-paused">{{ m.pausedLine }}</p>

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
            <CheckCircle
              :on="status(h) === 'completed'"
              :muted="status(h) === 'missed'"
              :label="status(h) === 'completed' ? m.undo(h.title) : m.complete(h.title)"
              :disabled="status(h) === 'missed'"
              data-testid="habit-toggle"
              @click="toggle(h)"
            >
              <!-- SPEC §5 Celebrations: the ring fills around the habit as it's done. -->
              <svg v-if="justDone === h.id" aria-hidden="true" viewBox="0 0 36 36" class="celebrate-ring pointer-events-none absolute -inset-1.5 size-11 -rotate-90" data-testid="habit-ring">
                <circle cx="18" cy="18" r="16" fill="none" stroke="var(--done)" stroke-width="3" stroke-linecap="round" />
              </svg>
            </CheckCircle>
            <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="edit(h)">
              <span class="text-base break-words" :class="status(h) === 'completed' ? 'text-muted' : ''">{{ h.title }}</span>
              <span class="flex flex-wrap gap-x-3 text-xs text-muted" data-testid="habit-meta">
                <span data-testid="habit-status">{{
                  status(h) === 'completed' ? m.doneToday : status(h) === 'missed' ? m.missedToday : status(h) === 'paused' ? m.pausedToday : dueText(h)
                }}</span>
                <span data-testid="habit-streak" :class="{ 'celebrate-bounce': justDone === h.id }"><AppIcon name="flame" class="mr-1" />{{ m.streak(streakOf(h).current) }}</span>
                <span data-testid="habit-best">{{ m.best(streakOf(h).best) }}</span>
                <span v-if="keptOf(h).total" data-testid="habit-kept">{{ m.keptLately(keptOf(h).kept, keptOf(h).total) }}</span>
                <span v-if="h.is_priority" class="text-carried"><AppIcon name="alert" class="mr-1" />{{ m.priorityBadge }}</span>
              </span>
            </button>
            <RowDelete :label="m.deleteLabel(h.title)" @click="askDelete(h)" />
          </div>
          <p v-if="status(h) === 'missed'" class="text-sm text-muted">{{ m.missedNote }}</p>
          <p v-if="celebrated === h.id" class="text-sm font-medium text-accent" role="status">{{ m.newBest }}</p>
        </li>
      </ul>
    </section>

    <section v-if="notToday.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.notTodayHeading }}</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="h in notToday" :key="h.id" class="flex items-start gap-1 rounded-2xl border border-line bg-surface p-3 pr-1">
          <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="edit(h)">
            <span>{{ h.title }}</span>
            <span class="flex gap-3 text-xs text-muted">
              <span>{{ h.weekdays.map((d) => m.weekdayNames[d]).join(' ') }}</span>
              <span><AppIcon name="flame" class="mr-1" />{{ m.streak(streakOf(h).current) }}</span>
              <span>{{ m.best(streakOf(h).best) }}</span>
              <span v-if="keptOf(h).total">{{ m.keptLately(keptOf(h).kept, keptOf(h).total) }}</span>
            </span>
          </button>
          <RowDelete :label="m.deleteLabel(h.title)" @click="askDelete(h)" />
        </li>
      </ul>
    </section>

    <HabitEditor :habit="editing" :is-new="isNew" @save="save" @delete="remove" @close="editing = null" />
    <!-- SPEC §2 Confirm before impact: a habit goes with its history, so the row's trash can asks first. -->
    <ConfirmDialog
      ref="confirmDialog"
      :heading="m.confirmDelete.heading"
      :body="m.confirmDelete.body(deleting?.title ?? '')"
      :confirm-label="m.confirmDelete.confirm"
      :keep-label="m.confirmDelete.keep"
      @confirm="deleting && remove(deleting)"
    />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Habits: today's habits with their timer deadlines, streaks and best streaks.
import { useNow } from '@/composables/useNow'
import AppIcon from '@/components/AppIcon.vue'
import { computed, ref, watch } from 'vue'
import HabitEditor from '@/habits/components/HabitEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useAuthStore } from '@/stores/auth'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { dayStatus, deadline, dueByMidnight, isScheduled, keptLately, newHabit, openPause, streaks, type DayStatus } from '@/habits/rules'
import { addDays } from '@/tasks/days'
import { messages } from '@/messages'
import { momentLabel } from '@/ui/dates'
import type { HabitLogRow, HabitPauseRow, HabitRow } from '@/sync/types'
import { live } from '@/sync/live'
import { useRoute, useRouter } from 'vue-router'
import PageHeading from '@/components/PageHeading.vue'
import NewButton from '@/components/NewButton.vue'
import RowDelete from '@/components/RowDelete.vue'
import CheckCircle from '@/components/CheckCircle.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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
const pauses = useLiveQuery<HabitPauseRow[]>(async () => (brain.db ? live(await brain.db.habit_pauses.toArray()) : []), [], [() => brain.db])
const pausedNow = computed(() => !!openPause(pauses.value))

// A clock that ticks each minute, so a timer running out shows as missed without a reload.
const now = useNow()

// SPEC §5 Habits: a timer runs out at its deadline. This only changes when one of today's or yesterday's
// deadlines passes, so the minute clock doesn't redo the work below every minute.
const deadlinesPassed = computed(() => {
  const at = now.value.getTime()
  const yesterday = addDays(today.value, -1)
  return habits.value.filter((h) => at > deadline(h, today.value, timeZone.value)).length +
    habits.value.filter((h) => at > deadline(h, yesterday, timeZone.value)).length
})

// Record misses and refresh cached streaks whenever habits, the day or a deadline changes.
watch(
  [() => habits.value.map((h) => h.id).join(), today, deadlinesPassed, () => brain.habitsReady],
  async () => {
    for (const h of habits.value) await brain.refreshHabit(h, now.value, timeZone.value)
  },
  { immediate: true },
)

const scheduledToday = computed(() => habits.value.filter((h) => isScheduled(h, today.value)))
const notToday = computed(() => habits.value.filter((h) => !isScheduled(h, today.value)))

/**
 * Each habit's status today and streaks, straight from the logs (so they are right even before the cached numbers
 * are refreshed), worked out once per change rather than for every place the page shows them.
 */
const byHabit = computed(() => {
  const map = new Map<string, { status: DayStatus; streak: { current: number; best: number }; kept: { kept: number; total: number } }>()
  for (const h of habits.value) {
    map.set(h.id, {
      status: dayStatus(h, today.value, logs.value, now.value, timeZone.value, pauses.value),
      streak: streaks(h, logs.value, now.value, timeZone.value, pauses.value),
      kept: keptLately(h, logs.value, now.value, timeZone.value, pauses.value),
    })
  }
  return map
})
const none = { status: 'not_scheduled' as DayStatus, streak: { current: 0, best: 0 }, kept: { kept: 0, total: 0 } }
const streakOf = (h: HabitRow) => (byHabit.value.get(h.id) ?? none).streak
const keptOf = (h: HabitRow) => (byHabit.value.get(h.id) ?? none).kept
const status = (h: HabitRow) => (byHabit.value.get(h.id) ?? none).status
function dueText(h: HabitRow) {
  if (dueByMidnight(h, today.value)) return m.dueToday
  return m.dueBy(momentLabel(new Date(deadline(h, today.value, timeZone.value)).toISOString()))
}

const celebrated = ref<string | null>(null)
const justDone = ref<string | null>(null)
async function toggle(h: HabitRow) {
  const before = streakOf(h).best
  const kind = await brain.toggleHabit(h, new Date(), timeZone.value)
  now.value = new Date()
  justDone.value = kind === 'complete' ? h.id : null
  const after = streaks(h, (await brain.db?.habit_logs.toArray()) ?? [], now.value, timeZone.value, pauses.value).best
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
  await brain.save('habits', h)
  editing.value = null
}
async function remove(h: HabitRow) {
  await brain.deleteHabit(h.id)
  confirmDialog.value?.close()
  if (editing.value?.id === h.id) editing.value = null
  deleting.value = null
}
const deleting = ref<HabitRow | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
function askDelete(h: HabitRow) {
  deleting.value = h
  confirmDialog.value?.open()
}

</script>
