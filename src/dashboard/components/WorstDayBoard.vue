<template>
  <!-- SPEC §5 Dashboard: Days since your worst day, chalked on a small chalkboard. -->
  <section class="chalkboard mx-auto w-full max-w-60 shrink-0" data-testid="dash-key" aria-labelledby="dash-worst-day-label">
    <div class="chalkboard-slate flex flex-col items-center gap-2 px-4 py-6 text-center">
      <span class="chalk text-7xl leading-none font-bold tabular-nums" data-testid="dash-worst-day">{{ days }}</span>
      <h2 id="dash-worst-day-label" class="chalk text-sm font-medium">{{ messages.dashboard.worstDay }}</h2>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: the worst-day count chalked on a small chalkboard, big number in the middle.
import { messages } from '@/messages'

defineProps<{ days: number }>()
</script>
