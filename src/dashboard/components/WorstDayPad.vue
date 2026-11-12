<template>
  <!-- SPEC §5 Dashboard: Days since your worst day, written on a tear-off calendar page. -->
  <section class="tearpad mx-auto w-full max-w-60 shrink-0" data-testid="dash-key" aria-labelledby="dash-worst-day-label">
    <div class="tearpad-binding" aria-hidden="true"><span /><span /></div>
    <div class="tearpad-page flex flex-col items-center gap-1 px-4 pt-5 pb-8 text-center">
      <span class="text-7xl leading-none font-bold tabular-nums" data-testid="dash-worst-day">{{ days }}</span>
      <h2 id="dash-worst-day-label" class="text-sm font-medium">{{ messages.dashboard.worstDay }}</h2>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: the worst-day count as a page torn from a day-by-day calendar pad, big number in the middle.
import { messages } from '@/messages'

defineProps<{ days: number }>()
</script>
