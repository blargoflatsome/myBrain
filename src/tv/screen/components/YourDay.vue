<template>
  <section class="tv-panel tv-day" aria-labelledby="tv-day-heading" data-testid="tv-your-day">
    <div class="tv-routines-bar">
      <h2 id="tv-day-heading" class="tv-panel-heading">{{ m.dayHeading }}</h2>
      <div v-if="page.pages > 1" class="tv-pager tv-routines-pager">
        <button type="button" class="tv-button tv-arrow" :aria-label="m.previousPage" :aria-disabled="page.page === 0" data-testid="tv-day-prev" @click="turn(-1)">‹</button>
        <p class="tv-pager-count" data-testid="tv-day-page">{{ m.page(page.page + 1, page.pages) }}</p>
        <button type="button" class="tv-button tv-arrow" :aria-label="m.nextPage" :aria-disabled="page.page === page.pages - 1" data-testid="tv-day-next" @click="turn(1)">›</button>
      </div>
    </div>
    <p v-if="!rows.length" class="tv-muted" data-testid="tv-day-empty">{{ allDone ? m.dayAllDone : m.dayEmpty }}</p>
    <ul v-else class="tv-day-list">
      <li v-for="row in page.rows" :key="row.kind + row.id" class="tv-day-row" data-testid="tv-day-row">
        <span class="tv-day-title">{{ row.title }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Your Day: what's left of today, titles only (events, then tasks, then habits); each leaves once
// passed or done, and an all-done day says so. A page at a time, so it stays inside its box; ‹ and › turn pages with
// the remote. At either end they stay focusable (aria-disabled), so focus isn't lost from under the remote.
import { computed, ref } from 'vue'
import { DAY_PAGE_SIZE, pageOf, type DayRow } from '@/tv/screen/dashboard'
import { messages } from '@/messages'

const props = defineProps<{ rows: DayRow[]; allDone: boolean }>()
const m = messages.tv
const wanted = ref(0)
const page = computed(() => pageOf(props.rows, wanted.value, DAY_PAGE_SIZE))

function turn(by: number) {
  wanted.value = page.value.page + by
}
</script>
