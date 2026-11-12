<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.intro }}</p>
    </div>

    <!-- The top row (SPEC §5 Dashboard): Days since your worst day beside the Post Its, to their left (under them on a
         phone; on top without them), then Up next and yesterday. -->
    <div class="flex flex-col gap-5 sm:flex-row sm:items-start" data-testid="dash-top">
      <div class="min-w-0 empty:hidden sm:flex-1"><PostItBoard /></div>
      <WorstDayBoard v-if="stats" :days="stats.worstDay" class="sm:order-first sm:mx-0" />
    </div>
    <UpNextCard />
    <!-- Yesterday (SPEC §5 Dashboard). -->
    <section v-if="stats" :class="card" data-testid="dash-yesterday" aria-labelledby="dash-yesterday-heading">
      <h2 id="dash-yesterday-heading" class="text-lg font-semibold">{{ m.yesterdayHeading }}</h2>
      <p v-if="stats.yesterday.empty" class="text-muted">{{ m.yesterdayEmpty }}</p>
      <template v-else>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="flex flex-col">
            <dt class="text-sm text-muted">{{ m.yesterdayHabits }}</dt>
            <dd :class="smallNumber" data-testid="dash-yesterday-habits">{{ m.ofTotal(stats.yesterday.habits.kept, stats.yesterday.habits.scheduled) }}</dd>
          </div>
          <div class="flex flex-col">
            <dt class="text-sm text-muted">{{ m.yesterdayRoutines }}</dt>
            <dd :class="smallNumber" data-testid="dash-yesterday-routines">{{ m.ofTotal(stats.yesterday.routines.finished, stats.yesterday.routines.total) }}</dd>
          </div>
          <div class="flex flex-col">
            <dt class="text-sm text-muted">{{ m.yesterdayTasks }}</dt>
            <dd :class="smallNumber" data-testid="dash-yesterday-tasks">{{ m.ofTotal(stats.yesterday.tasks.done, stats.yesterday.tasks.due) }}</dd>
          </div>
          <div class="flex flex-col">
            <dt class="text-sm text-muted">{{ m.yesterdayQuests }}</dt>
            <dd :class="smallNumber" data-testid="dash-yesterday-quests">{{ stats.yesterday.quests.length }}</dd>
          </div>
        </dl>
        <ul v-if="stats.yesterday.quests.length" class="flex flex-wrap gap-2 text-sm" :aria-label="m.yesterdayQuests">
          <li v-for="(q, i) in stats.yesterday.quests" :key="i" class="rounded-full border border-line px-3 py-1" data-testid="dash-yesterday-quest">✓ {{ q }}</li>
        </ul>
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
      <!-- Yesterday's leftovers (SPEC §5 Dashboard): tasks due yesterday still open, with Undated and Let it go. -->
      <div v-if="stats.leftovers.length" class="flex flex-col gap-2" data-testid="dash-leftovers">
        <h3 class="text-sm font-semibold">{{ m.leftoversHeading }}</h3>
        <ul class="flex flex-col gap-2">
          <li v-for="task in stats.leftovers" :key="task.id" class="flex flex-wrap items-center justify-between gap-2" data-testid="dash-leftover">
            <span class="min-w-0 break-words">{{ task.title }}</span>
            <span class="flex shrink-0 gap-2">
              <button type="button" :class="smallButton" :aria-label="m.leftoverUndated(task.title)" @click="leftoverUndated(task)">{{ m.undated }}</button>
              <button type="button" :class="smallButton" :aria-label="m.leftoverLetGo(task.title)" @click="leftoverLetGo(task)">{{ m.letGo }}</button>
            </span>
          </li>
        </ul>
      </div>
      <ul v-if="yesterdayTrophies.length" class="flex flex-wrap gap-2 text-sm" :aria-label="t.yesterday">
        <li v-for="item in yesterdayTrophies" :key="item.id" class="flex items-center gap-1 rounded-full border border-line px-3 py-1" data-testid="dash-yesterday-trophy">
          <AppIcon name="trophy" class="text-done" />{{ trophyName(item) }}
        </li>
      </ul>
    </section>


    <template v-if="stats">
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
            <span class="font-semibold"><AppIcon name="star" class="mr-1 text-star" />{{ f.bucket.name }}</span>
            <ul v-if="f.newest.length" class="flex flex-col gap-1 text-sm">
              <li v-for="i in f.newest" :key="i.id" class="truncate">{{ i.title }}</li>
            </ul>
            <p v-else class="text-sm text-muted">{{ messages.vault.empty }}</p>
          </RouterLink>
        </div>
      </section>

      <!-- SPEC §5 Trophies: newest levels, everything by category, and the locked ones in a window. -->
      <TrophiesSection :items="board.items" />
    </template>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: yesterday, days since your worst day, favorite buckets and Trophies. Updates live.
import { readTables } from '@/sync/db'
import { DAY_TABLES, dayStats } from '@/journal/stats'
import { useNow } from '@/composables/useNow'
import AppIcon from '@/components/AppIcon.vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import PostItBoard from '@/postits/components/PostItBoard.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { daysSinceWorstDay, favoriteBuckets, yesterdayLeftovers, yesterdaySummary } from '@/dashboard/stats'
import UpNextCard from '@/dashboard/components/UpNextCard.vue'
import WorstDayBoard from '@/dashboard/components/WorstDayBoard.vue'
import { cancelTask, moveTask } from '@/tasks/rules'
import { useUndoStore } from '@/stores/undo'
import type { TaskRow } from '@/sync/types'
import { addDays } from '@/tasks/days'
import { messages } from '@/messages'
import { card, smallButton, smallNumber } from '@/ui/styles'
import TrophiesSection from '@/trophies/components/TrophiesSection.vue'
import { useTrophyBoard } from '@/trophies/useTrophyBoard'
import { earnedOn, trophyName } from '@/trophies/board'

const brain = useBrainStore()
const m = messages.dashboard

const { today, timeZone } = useToday()
const cm = messages.celebrations
const t = cm.trophies

// Trophies (SPEC §5 Trophies): every trophy with its level and progress; yesterday's go in the yesterday box.
const board = useTrophyBoard()
const yesterdayTrophies = computed(() => earnedOn(board.value.items, addDays(today.value, -1)))

// A clock that ticks each minute, so yesterday's numbers follow the time of day.
const now = useNow()

const stats = useLiveQuery(
  async () => {
    const db = brain.db
    if (!db) return null
    const day = await readTables(db, DAY_TABLES)
    const { journal, buckets, vaultItems } = await readTables(db, {
      journal: 'journal_entries',
      buckets: 'vault_buckets',
      vaultItems: 'vault_items',
    })
    return {
      yesterday: yesterdaySummary(dayStats(day, addDays(today.value, -1), now.value, timeZone.value)),
      leftovers: yesterdayLeftovers(day.tasks, today.value),
      worstDay: daysSinceWorstDay(journal, today.value),
      favorites: favoriteBuckets(buckets, vaultItems),
    }
  },
  null,
  [() => brain.db, now, today],
)



// Yesterday's leftovers (SPEC §5 Dashboard): Undated or Let it go (cancel), each with Undo.
const undo = useUndoStore()
async function leftoverUndated(task: TaskRow) {
  await brain.saveTask(moveTask(task, null))
  undo.offer(messages.undo.movedUndated(task.title), () => brain.saveTask(task))
}
async function leftoverLetGo(task: TaskRow) {
  await brain.saveTask(cancelTask(task))
  undo.offer(messages.undo.cancelled(task.title), () => brain.saveTask(task))
}
</script>
