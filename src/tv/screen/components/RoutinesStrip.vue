<template>
  <section class="tv-panel tv-routines" aria-labelledby="tv-routines-heading" data-testid="tv-routines">
    <div class="tv-routines-bar">
      <h2 id="tv-routines-heading" class="tv-panel-heading">{{ m.heading }}</h2>
      <div v-if="page.pages > 1" class="tv-pager tv-routines-pager">
        <button type="button" class="tv-button tv-arrow" :aria-label="tv.previousPage" :aria-disabled="page.page === 0" data-testid="tv-routines-prev" @click="turn(-1)">‹</button>
        <p class="tv-pager-count" data-testid="tv-routines-page">{{ tv.page(page.page + 1, page.pages) }}</p>
        <button type="button" class="tv-button tv-arrow" :aria-label="tv.nextPage" :aria-disabled="page.page === page.pages - 1" data-testid="tv-routines-next" @click="turn(1)">›</button>
      </div>
    </div>
    <p v-if="!rows.length" class="tv-muted">{{ m.empty }}</p>
    <ul v-else class="tv-routine-list">
      <li v-for="row in page.rows" :key="row.routine.id" class="tv-routine-item">
        <!-- Nothing to run today (done, not today, no steps): still focusable, so the remote isn't left stranded. -->
        <button
          type="button"
          class="tv-button tv-routine"
          :aria-disabled="!routineButton(row)"
          :data-routine="row.routine.id"
          data-testid="tv-routine"
          @click="routineButton(row) && emit('open', row.routine.id)"
        >
          <span class="tv-routine-title">{{ row.routine.title }}</span>
          <span class="tv-routine-status">{{ routineStatusText(row) }}</span>
          <span v-if="routineButton(row)" class="tv-routine-action">{{ routineButton(row) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Routines: my routines a page at a time, each with today's status and its Start, Continue or Resume
// (the Routines page's own rules). Choosing one opens it full screen.
import { computed, ref } from 'vue'
import { ROUTINE_PAGE_SIZE, pageOf } from '@/tv/screen/dashboard'
import { routineButton, routineStatusText, type RoutineToday } from '@/routines/listing'
import { messages } from '@/messages'

const props = defineProps<{ rows: RoutineToday[] }>()
const emit = defineEmits<{ open: [id: string] }>()
const m = messages.routines
const tv = messages.tv
const wanted = ref(0)
const page = computed(() => pageOf(props.rows, wanted.value, ROUTINE_PAGE_SIZE))

function turn(by: number) {
  wanted.value = page.value.page + by
}
</script>
