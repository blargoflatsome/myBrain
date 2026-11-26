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
    </div>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, The dashboard: the Monthly calendar on the left two thirds and Your Day on the right (Layout).
// Routines fill the strip along the bottom; Go on a Quest joins it in the next build step.
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
}>()
const emit = defineEmits<{ move: [by: number]; 'open-routine': [id: string] }>()
const m = messages.tv
const clock = computed(() => timeLabel(clockIn(props.now.getTime(), props.timeZone)))
</script>
