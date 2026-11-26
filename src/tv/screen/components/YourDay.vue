<template>
  <section class="tv-panel tv-day" aria-labelledby="tv-day-heading" data-testid="tv-your-day">
    <h2 id="tv-day-heading" class="tv-panel-heading">{{ m.dayHeading }}</h2>
    <p v-if="!rows.length" class="tv-muted" data-testid="tv-day-empty">{{ m.dayEmpty }}</p>
    <ul v-else class="tv-day-list">
      <li
        v-for="row in page.rows"
        :key="row.kind + row.id"
        class="tv-day-row"
        :class="{ 'tv-item-done': row.kind === 'task' && row.done }"
        data-testid="tv-day-row"
      >
        <span v-if="row.kind === 'event'" class="tv-day-when">{{ when(row.start, row.end) }}</span>
        <span v-else class="tv-day-check" :class="{ 'tv-day-checked': row.done }" aria-hidden="true" />
        <span class="tv-day-text">
          <span class="tv-day-title">{{ row.title }}</span>
          <span v-if="row.kind === 'task' && row.done" class="tv-sr-only">{{ m.heardAfter(m.done) }}</span>
          <span v-if="row.kind === 'task' && row.carriedOver" class="tv-day-note">{{ m.carriedOver }}</span>
        </span>
      </li>
    </ul>
    <div v-if="page.pages > 1" class="tv-pager">
      <button type="button" class="tv-button tv-arrow" :aria-label="m.previousPage" :aria-disabled="page.page === 0" data-testid="tv-day-prev" @click="turn(-1)">‹</button>
      <p class="tv-pager-count" data-testid="tv-day-page">{{ m.page(page.page + 1, page.pages) }}</p>
      <button type="button" class="tv-button tv-arrow" :aria-label="m.nextPage" :aria-disabled="page.page === page.pages - 1" data-testid="tv-day-next" @click="turn(1)">›</button>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Your Day: today's events in time order, then today's tasks (carried-over ones included, done ones
// crossed off at the end). A page at a time, so it stays inside its box; ‹ and › turn pages with the remote. At either
// end they stay focusable (aria-disabled), so focus isn't lost from under the remote.
import { computed, ref } from 'vue'
import { DAY_PAGE_SIZE, pageOf, type DayRow } from '@/tv/screen/dashboard'
import { timeLabel } from '@/ui/dates'
import { messages } from '@/messages'

const props = defineProps<{ rows: DayRow[] }>()
const m = messages.tv
const wanted = ref(0)
const page = computed(() => pageOf(props.rows, wanted.value, DAY_PAGE_SIZE))

function turn(by: number) {
  wanted.value = page.value.page + by
}
function when(start: string | null, end: string | null): string {
  if (!start) return end ? m.until(timeLabel(end)) : m.allDay
  return end ? m.timeRange(timeLabel(start), timeLabel(end)) : timeLabel(start)
}
</script>
