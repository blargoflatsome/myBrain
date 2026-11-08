<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-28 xl:max-w-5xl">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
        <p class="text-muted italic">{{ m.intro }}</p>
      </div>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.period }}
        <select
          :value="period"
          class="min-h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink"
          @change="setPeriod(($event.target as HTMLSelectElement).value as Period)"
        >
          <option v-for="p in PERIODS" :key="p" :value="p">{{ m.periods[p] }}</option>
        </select>
      </label>
    </div>

    <!-- The top row (SPEC §5 Dashboard): Post Its first; on a wide screen, how yesterday went sits to their left. -->
    <div class="flex flex-col gap-5 xl:has-[[data-testid=dash-postits]]:grid xl:has-[[data-testid=dash-postits]]:grid-cols-[minmax(0,1fr)_32rem] xl:has-[[data-testid=dash-postits]]:items-start" data-testid="dash-top">
      <PostItBoard />
      <!-- Yesterday (SPEC §5 Dashboard). Not affected by the period. -->
      <section v-if="stats" :class="[card, 'xl:order-first']" data-testid="dash-yesterday" aria-labelledby="dash-yesterday-heading">
        <h2 id="dash-yesterday-heading" class="text-lg font-semibold">{{ m.yesterdayHeading }}</h2>
        <p v-if="stats.yesterday.empty" class="text-muted">{{ m.yesterdayEmpty }}</p>
        <template v-else>
          <dl class="grid grid-cols-3 gap-3">
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ m.yesterdayHabits }}</dt>
              <dd :class="bigNumber" data-testid="dash-yesterday-habits">{{ m.ofTotal(stats.yesterday.habits.kept, stats.yesterday.habits.scheduled) }}</dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ m.yesterdayRoutines }}</dt>
              <dd :class="bigNumber" data-testid="dash-yesterday-routines">{{ m.ofTotal(stats.yesterday.routines.finished, stats.yesterday.routines.total) }}</dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-sm text-muted">{{ m.yesterdayTasks }}</dt>
              <dd :class="bigNumber" data-testid="dash-yesterday-tasks">{{ m.ofTotal(stats.yesterday.tasks.done, stats.yesterday.tasks.due) }}</dd>
            </div>
          </dl>
          <ul v-if="stats.yesterday.routines.list.length" class="flex flex-wrap gap-2 text-sm" :aria-label="m.yesterdayRoutines">
            <li
              v-for="r in stats.yesterday.routines.list"
              :key="r.id"
              class="rounded-full border border-line px-3 py-1"
              data-testid="dash-yesterday-routine"
            >
              {{ r.done >= r.total ? '✓ ' : '' }}{{ r.title }} {{ r.done }}/{{ r.total }}
            </li>
          </ul>
        </template>
      </section>
    </div>

    <!-- Notifications can be missed, so today's are listed here (SPEC §5 Dashboard). -->

    <template v-if="stats">
      <section class="flex flex-col gap-3" data-testid="dash-habits">
        <h2 class="text-lg font-semibold">{{ m.habitsHeading }}</h2>
        <p v-if="!stats.habits.rows.length" class="text-muted">{{ m.noHabits }}</p>
        <template v-else>
          <div class="grid gap-3 sm:grid-cols-3">
            <div :class="card" data-testid="dash-longest-current">
              <span class="text-sm text-muted">{{ m.longestCurrent }}</span>
              <span :class="bigNumber">{{ stats.habits.longestCurrent?.current ?? 0 }}</span>
              <span class="text-sm">{{ stats.habits.longestCurrent ? `🔥 ${stats.habits.longestCurrent.habit.title}` : m.none }}</span>
            </div>
            <div :class="card" data-testid="dash-best-ever">
              <span class="text-sm text-muted">{{ m.bestEver }}</span>
              <span :class="bigNumber">{{ stats.habits.bestEver?.best ?? 0 }}</span>
              <span class="text-sm">{{ stats.habits.bestEver ? `🏆 ${stats.habits.bestEver.habit.title}` : m.none }}</span>
            </div>
            <div :class="card" data-testid="dash-oldest">
              <span class="text-sm text-muted">{{ m.oldest }}</span>
              <span class="text-xl font-bold">{{ stats.habits.oldest?.title }}</span>
              <span v-if="stats.habits.oldest" class="text-sm text-muted">{{ m.since(dateWithYear(stats.habits.oldest.start_date)) }}</span>
            </div>
          </div>

          <div :class="card" data-testid="dash-most-missed">
            <h3 class="font-semibold">{{ m.mostMissed }}</h3>
            <p v-if="!stats.habits.mostMissed.length" class="text-sm text-muted">{{ m.noMisses }}</p>
            <div v-for="x in stats.habits.mostMissed" :key="x.habit.id" class="flex items-center gap-3">
              <span class="w-32 shrink-0 truncate text-sm">{{ x.habit.title }}</span>
              <div class="h-3 flex-1 overflow-hidden rounded-full bg-line">
                <div class="h-full rounded-full bg-danger/70" :style="{ width: `${(x.missed / maxMissed) * 100}%` }" />
              </div>
              <span class="w-16 text-right text-sm tabular-nums">{{ m.missedDays(x.missed) }}</span>
            </div>
          </div>

          <div :class="card" data-testid="dash-habit-list">
            <h3 class="font-semibold">{{ m.allHabits }}</h3>
            <div v-for="r in stats.habits.rows" :key="r.habit.id" class="flex flex-col gap-1" data-testid="dash-habit">
              <div class="flex items-baseline justify-between gap-3 text-sm">
                <span class="truncate font-medium">{{ r.habit.title }}</span>
                <span class="shrink-0 text-muted">{{ m.streakPair(r.current, r.best) }}</span>
              </div>
              <div class="relative h-2 overflow-hidden rounded-full bg-line" role="img" :aria-label="m.streakPair(r.current, r.best)">
                <div class="absolute inset-y-0 left-0 rounded-full bg-accent/35" :style="{ width: `${(r.best / maxBest) * 100}%` }" />
                <div class="absolute inset-y-0 left-0 rounded-full bg-accent" :style="{ width: `${(r.current / maxBest) * 100}%` }" />
              </div>
            </div>
          </div>
        </template>
      </section>

      <div class="grid gap-3 sm:grid-cols-2">
        <section :class="card" data-testid="dash-journal">
          <h2 class="text-lg font-semibold">{{ m.journalHeading }}</h2>
          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col">
              <span class="text-sm text-muted">{{ m.journalCurrent }}</span>
              <span :class="bigNumber" data-testid="dash-journal-current">{{ stats.journal.current }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-sm text-muted">{{ m.journalBest }}</span>
              <span :class="bigNumber" data-testid="dash-journal-best">{{ stats.journal.best }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-sm text-muted">{{ m.worstDay }}</span>
              <span :class="bigNumber" data-testid="dash-worst-day">{{ stats.worstDay }}</span>
            </div>
          </div>
        </section>

        <section :class="card" data-testid="dash-events">
          <h2 class="text-lg font-semibold">{{ m.eventsHeading }}</h2>
          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col">
              <span class="text-sm text-muted">{{ m.created }}</span>
              <span :class="bigNumber" data-testid="dash-events-created">{{ stats.events.created }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-sm text-muted">{{ m.attended }}</span>
              <span :class="bigNumber" data-testid="dash-events-attended">{{ stats.events.attended }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-sm text-muted">{{ m.cancelled }}</span>
              <span :class="bigNumber" data-testid="dash-events-cancelled">{{ stats.events.cancelled }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Favorite Vault buckets (SPEC §5 The Vault) -->
      <section v-if="stats.favorites.length" class="flex flex-col gap-3" data-testid="dash-favorites">
        <h2 class="text-lg font-semibold">{{ m.favoritesHeading }}</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RouterLink
            v-for="f in stats.favorites"
            :key="f.bucket.id"
            :to="{ name: 'vault', query: { bucket: f.bucket.id } }"
            :class="[card, 'min-w-0 hover:border-accent']"
            data-testid="dash-favorite"
          >
            <span class="font-semibold">★ {{ f.bucket.name }}</span>
            <ul v-if="f.newest.length" class="flex flex-col gap-1 text-sm">
              <li v-for="i in f.newest" :key="i.id" class="truncate">{{ i.title }}</li>
            </ul>
            <p v-else class="text-sm text-muted">{{ messages.vault.empty }}</p>
          </RouterLink>
        </div>
      </section>

      <section :class="card" data-testid="dash-doing">
        <h2 class="text-lg font-semibold">{{ m.doingHeading }}</h2>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col">
            <span class="text-sm text-muted">{{ m.tasksDone }}</span>
            <span :class="bigNumber" data-testid="dash-tasks">{{ stats.tasks }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-sm text-muted">{{ m.questsDone }}</span>
            <span :class="bigNumber" data-testid="dash-quests">{{ stats.quests }}</span>
          </div>
        </div>
        <div v-if="stats.routines.length" class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold">{{ m.routines }}</h3>
          <div v-for="r in stats.routines" :key="r.routine.id" class="flex items-center gap-3" data-testid="dash-routine">
            <span class="w-32 shrink-0 truncate text-sm">{{ r.routine.title }}</span>
            <template v-if="r.anytime">
              <span class="text-sm text-muted">{{ messages.routines.finishedTimes(r.completed) }}</span>
            </template>
            <template v-else>
              <div
                class="h-3 flex-1 overflow-hidden rounded-full bg-line"
                role="meter"
                :aria-label="r.routine.title"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="percent(r.completed, r.possible)"
              >
                <div class="h-full rounded-full bg-accent" :style="{ width: `${percent(r.completed, r.possible)}%` }" />
              </div>
              <span class="w-12 text-right text-sm tabular-nums">{{ r.possible ? `${percent(r.completed, r.possible)}%` : '–' }}</span>
            </template>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: all my stats at a glance, for This year (default), Last 12 months or All time. Updates live.
import { computed, onScopeDispose, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PostItBoard from '@/components/PostItBoard.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import {
  daysSinceWorstDay,
  favoriteBuckets,
  eventStats,
  habitStats,
  journalStreaks,
  periodStart,
  PERIODS,
  questsFinished,
  routineSummaries,
  tasksDone,
  yesterdaySummary,
  type Period,
} from '@/dashboard/stats'
import { addDays } from '@/tasks/days'
import { percent } from '@/routines/rules'
import { messages } from '@/messages'
import { dateWithYear } from '@/ui/dates'
import { bigNumber, card } from '@/ui/styles'

const brain = useBrainStore()
const m = messages.dashboard
const { today, timeZone } = useToday()

// The period is remembered on this device (a convenience; the default is This year).
const saved = (() => {
  try {
    return localStorage.getItem('dashboard-period') as Period | null
  } catch {
    return null
  }
})()
const period = ref<Period>(saved && PERIODS.includes(saved) ? saved : 'year')
function setPeriod(p: Period) {
  period.value = p
  try {
    localStorage.setItem('dashboard-period', p)
  } catch {
    // Not available (private window): the choice just isn't remembered.
  }
}

// A clock that ticks each minute, so streaks and "attended" follow the time of day.
const now = ref(new Date())
const tick = setInterval(() => (now.value = new Date()), 60_000)
onScopeDispose(() => clearInterval(tick))

const stats = useLiveQuery(
  async () => {
    const db = brain.db
    if (!db) return null
    const from = periodStart(period.value, today.value)
    const [habits, habitLogs, journal, events, tasks, quests, routines, steps, runs, logs, invites, buckets, vaultItems] = await Promise.all([
      db.habits.toArray(),
      db.habit_logs.toArray(),
      db.journal_entries.toArray(),
      db.events.toArray(),
      db.tasks.toArray(),
      db.quests.toArray(),
      db.routines.toArray(),
      db.routine_steps.toArray(),
      db.routine_runs.toArray(),
      db.routine_step_logs.toArray(),
      db.event_invites.toArray(),
      db.vault_buckets.toArray(),
      db.vault_items.toArray(),
    ])
    return {
      yesterday: yesterdaySummary(await brain.journalStats(addDays(today.value, -1), now.value, timeZone.value)),
      habits: habitStats(habits, habitLogs, now.value, timeZone.value, from),
      journal: journalStreaks(journal, today.value),
      worstDay: daysSinceWorstDay(journal, today.value),
      favorites: favoriteBuckets(buckets, vaultItems),
      events: eventStats(events, from, now.value, timeZone.value, invites, brain.userId),
      tasks: tasksDone(tasks, from, now.value, timeZone.value),
      quests: questsFinished(quests, from, now.value, timeZone.value),
      routines: routineSummaries(routines, steps, runs, logs, habits, from, now.value, timeZone.value),
    }
  },
  null,
  [() => brain.db, period, now, today],
)

const maxBest = computed(() => Math.max(1, ...(stats.value?.habits.rows.map((r) => r.best) ?? [1])))
const maxMissed = computed(() => Math.max(1, ...(stats.value?.habits.mostMissed.map((r) => r.missed) ?? [1])))
</script>
