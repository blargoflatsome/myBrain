<template>
  <main class="tv-dashboard" data-testid="tv-dashboard">
    <header class="tv-bar">
      <h1 class="tv-heading">{{ m.title }}</h1>
      <p class="tv-clock" data-testid="tv-clock">{{ clock }}</p>
    </header>
    <p v-if="trouble" class="tv-note" role="status" data-testid="tv-trouble">{{ m.offline }}</p>
    <div class="tv-columns">
      <MonthCalendar class="tv-col-wide" :month="month" :today="today" :items="items" @move="(by) => emit('move', by)" />
      <YourDay class="tv-col-side" :rows="dayRows" />
    </div>
    <div class="tv-strip">
      <RoutinesStrip :rows="routineRows" @open="(id) => emit('open-routine', id)" />
      <div class="tv-panel tv-strip-actions">
        <button type="button" class="tv-button tv-strip-action" data-testid="tv-quest-open" @click="emit('quest')">{{ m.questHeading }}</button>
        <!-- SPEC §9 Focus timer: while it runs minimized, this button shows its part and time and opens it again. -->
        <button
          type="button"
          class="tv-button tv-strip-action"
          :aria-label="focusPill ? focus.openPill(focusPill.phase, focusPill.time) : undefined"
          data-testid="tv-focus-open"
          @click="emit('focus')"
        >
          <span v-if="focusPill" aria-hidden="true">{{ focusPill.phase }} · {{ focusPill.time }}</span>
          <template v-else>{{ focus.heading }}</template>
        </button>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, The dashboard: the Monthly calendar on the left two thirds and Your Day on the right (Layout).
// Routines, Go on a Quest and the Focus timer share the strip along the bottom.
import { computed } from 'vue'
import MonthCalendar from '@/tv/screen/components/MonthCalendar.vue'
import YourDay from '@/tv/screen/components/YourDay.vue'
import RoutinesStrip from '@/tv/screen/components/RoutinesStrip.vue'
import type { RoutineToday } from '@/routines/listing'
import type { CellItem, DayRow } from '@/tv/screen/dashboard'
import { clockIn } from '@/time/days'
import { timeLabel } from '@/ui/dates'
import { messages } from '@/messages'

const props = defineProps<{
  now: Date
  timeZone: string
  today: string
  month: string
  items: Record<string, CellItem[]>
  dayRows: DayRow[]
  routineRows: RoutineToday[]
  trouble: boolean
  /** A Focus timer running minimized: its part and time left. */
  focusPill: { phase: string; time: string } | null
}>()
const emit = defineEmits<{ move: [by: number]; 'open-routine': [id: string]; quest: []; focus: [] }>()
const m = messages.tv
const focus = messages.focus
const clock = computed(() => timeLabel(clockIn(props.now.getTime(), props.timeZone)))
</script>
