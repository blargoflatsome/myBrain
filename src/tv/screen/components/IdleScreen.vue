<template>
  <main class="tv-idle" :aria-label="m.nightLabel" data-testid="tv-idle">
    <p class="tv-idle-clock" data-testid="tv-idle-clock">{{ clock }}</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Idle screen: a night screen in muted black and greys, with the time as a large digital clock. It's
// meant to stay on while I sleep, so nothing on it is bright.
import { computed } from 'vue'
import { clockIn, deviceTimeZone } from '@/time/days'
import { timeLabel } from '@/ui/dates'
import { messages } from '@/messages'

const props = defineProps<{ now: Date }>()
const m = messages.tv
const clock = computed(() => timeLabel(clockIn(props.now.getTime(), deviceTimeZone())))
</script>
