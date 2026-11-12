<template>
  <!-- SPEC §5 Dashboard: Days since your worst day, chalked on the Dashboard's chalkboard. -->
  <section class="flex w-full shrink-0 flex-col items-center gap-2 py-2 text-center sm:w-52" data-testid="dash-key" aria-labelledby="dash-worst-day-label">
    <span class="chalk text-7xl leading-none font-bold tabular-nums" data-testid="dash-worst-day">{{ days }}</span>
    <h2 id="dash-worst-day-label" class="chalk text-sm font-medium">{{ messages.dashboard.worstDay }}</h2>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: the worst-day count chalked on the board, big number in the middle.
import { messages } from '@/messages'

defineProps<{ days: number }>()
</script>
