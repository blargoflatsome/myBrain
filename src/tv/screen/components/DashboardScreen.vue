<template>
  <main class="tv-dashboard" data-testid="tv-dashboard">
    <header class="tv-bar">
      <h1 class="tv-heading">{{ m.title }}</h1>
      <TvClock class="tv-clock" :now="now" :time-zone="timeZone" data-testid="tv-clock" />
    </header>
    <p v-if="trouble" class="tv-note" role="status" data-testid="tv-trouble">{{ m.offline }}</p>
    <div class="tv-columns">
      <MonthCalendar class="tv-col-wide" :month="month" :today="today" :items="items" @move="(by) => emit('move', by)" />
      <div class="tv-col-side">
        <YourDay :rows="day.rows" :all-done="day.allDone" />
        <RoutinesStrip :rows="routineRows" @open="(id) => emit('open-routine', id)" />
        <div class="tv-actions">
          <button type="button" class="tv-button tv-action" data-testid="tv-quest-open" @click="emit('quest')">{{ m.questHeading }}</button>
          <!-- SPEC §9 Focus timer: while it runs minimized, this button shows its part and time and opens it again. -->
          <button
            type="button"
            class="tv-button tv-action"
            :aria-label="focusPill ? focus.openPill(focusPill.phase, focusPill.time) : undefined"
            data-testid="tv-focus-open"
            @click="emit('focus')"
          >
            <span v-if="focusPill" aria-hidden="true">{{ focusPill.phase }} · {{ focusPill.time }}</span>
            <template v-else>{{ focus.heading }}</template>
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, The dashboard (Layout): the Monthly calendar on the left two thirds; on the right, Your Day above
// Routines, with Go on a Quest and the Focus timer side by side under them. It all fits one screen.
import MonthCalendar from '@/tv/screen/components/MonthCalendar.vue'
import YourDay from '@/tv/screen/components/YourDay.vue'
import RoutinesStrip from '@/tv/screen/components/RoutinesStrip.vue'
import type { RoutineToday } from '@/routines/listing'
import type { CellItem, DayRow } from '@/tv/screen/dashboard'
import TvClock from '@/tv/screen/components/TvClock.vue'
import { messages } from '@/messages'

defineProps<{
  now: Date
  timeZone: string
  today: string
  month: string
  items: Record<string, CellItem[]>
  day: { rows: DayRow[]; allDone: boolean }
  routineRows: RoutineToday[]
  trouble: boolean
  /** A Focus timer running minimized: its part and time left. */
  focusPill: { phase: string; time: string } | null
}>()
const emit = defineEmits<{ move: [by: number]; 'open-routine': [id: string]; quest: []; focus: [] }>()
const m = messages.tv
const focus = messages.focus
</script>
