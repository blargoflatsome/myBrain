<template>
  <section class="tv-panel tv-month" aria-labelledby="tv-month-name" data-testid="tv-calendar">
    <div class="tv-month-bar">
      <button type="button" class="tv-button tv-arrow" :aria-label="m.previousMonth" data-testid="tv-month-prev" @click="emit('move', -1)">‹</button>
      <h2 id="tv-month-name" class="tv-month-name" data-testid="tv-month-name">{{ monthLabel(month) }}</h2>
      <button type="button" class="tv-button tv-arrow" :aria-label="m.nextMonth" data-testid="tv-month-next" @click="emit('move', 1)">›</button>
      <button v-if="!onThisMonth" type="button" class="tv-button" data-testid="tv-month-this" @click="emit('move', 0)">{{ m.thisMonth }}</button>
    </div>
    <table class="tv-grid">
      <thead>
        <tr>
          <th v-for="day in weeks[0]" :key="day" scope="col">{{ weekdayShort(day) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="week in weeks" :key="week[0]">
          <td
            v-for="day in week"
            :key="day"
            :class="{ 'tv-day-out': !inMonth(day), 'tv-day-today': day === today }"
            :data-testid="`tv-day-${day}`"
          >
            <p class="tv-day-number">
              <span aria-hidden="true">{{ Number(day.slice(8)) }}</span>
              <span class="tv-sr-only">{{ shortDay(day) }}</span>
              <span v-if="day === today" class="tv-sr-only">, {{ m.today }}</span>
            </p>
            <ul v-if="shown(day).length" class="tv-cell-items">
              <li
                v-for="item in shown(day)"
                :key="item.id"
                class="tv-cell-item"
                :class="{ 'tv-item-task': item.kind === 'task', 'tv-item-done': item.done || item.cancelled, 'tv-item-pending': item.pending }"
                data-testid="tv-cell-item"
              >
                <span v-if="item.time" class="tv-item-time">{{ timeLabel(item.time) }}</span>
                {{ item.title }}
                <span v-if="item.done" class="tv-sr-only">, {{ m.done }}</span>
                <span v-if="item.cancelled" class="tv-sr-only">, {{ m.cancelled }}</span>
                <span v-if="item.pending" class="tv-sr-only">, {{ m.notAnswered }}</span>
              </li>
            </ul>
            <p v-if="hidden(day)" class="tv-cell-more" data-testid="tv-cell-more">{{ m.more(hidden(day)) }}</p>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Monthly calendar: my tasks with a due date and my events, read-only, a month at a time. ‹ and › step
// through months; This month comes back.
import { computed } from 'vue'
import { CELL_ITEMS, monthOf, monthWeeks, type CellItem } from '@/tv/screen/dashboard'
import { monthLabel, shortDay, timeLabel, weekdayShort } from '@/ui/dates'
import { messages } from '@/messages'

const props = defineProps<{ month: string; today: string; items: Record<string, CellItem[]> }>()
const emit = defineEmits<{ move: [by: number] }>()
const m = messages.tv

const weeks = computed(() => monthWeeks(props.month))
const onThisMonth = computed(() => monthOf(props.today) === props.month)
const inMonth = (day: string) => day.slice(0, 7) === props.month.slice(0, 7)
const all = (day: string) => props.items[day] || []
// With one too many, the last line would only say "+1 more", so it shows the item instead.
const shown = (day: string) => (all(day).length <= CELL_ITEMS ? all(day) : all(day).slice(0, CELL_ITEMS - 1))
const hidden = (day: string) => all(day).length - shown(day).length
</script>
