<template>
  <main class="tv-dashboard" data-testid="tv-dashboard">
    <header class="tv-bar">
      <h1 class="tv-heading">{{ m.title }}</h1>
      <p class="tv-clock" data-testid="tv-clock">{{ clock }}</p>
    </header>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, The dashboard: its frame, with the time. Your Day, the Monthly calendar, Routines and Go on a Quest
// fill it in the next build steps.
import { computed } from 'vue'
import { clockIn, deviceTimeZone } from '@/time/days'
import { timeLabel } from '@/ui/dates'
import { messages } from '@/messages'

const props = defineProps<{ now: Date }>()
const m = messages.tv
const clock = computed(() => timeLabel(clockIn(props.now.getTime(), deviceTimeZone())))
</script>
