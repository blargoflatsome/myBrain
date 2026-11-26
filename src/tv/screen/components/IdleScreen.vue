<template>
  <main class="tv-idle" :aria-label="m.nightLabel" data-testid="tv-idle">
    <p class="tv-idle-clock" data-testid="tv-idle-clock">{{ clock }}</p>
    <section v-if="loaded" class="tv-idle-next" :aria-label="m.upNextLabel" data-testid="tv-idle-next">
      <p class="tv-idle-title" data-testid="tv-idle-next-title">{{ suggestionTitle(next) }}</p>
      <p v-if="suggestionReason(next, timeZone)" class="tv-idle-reason" data-testid="tv-idle-next-reason">{{ suggestionReason(next, timeZone) }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Idle screen: a night screen in muted black and greys, with the time as a large digital clock and the
// Dashboard's Up next under it (its title and short line; no buttons, nothing skipped). Nothing on it is bright.
import { computed } from 'vue'
import type { Suggestion } from '@/dashboard/upNext'
import { suggestionReason, suggestionTitle } from '@/dashboard/upNextText'
import { clockIn } from '@/time/days'
import { timeLabel } from '@/ui/dates'
import { messages } from '@/messages'

const props = defineProps<{ now: Date; timeZone: string; next: Suggestion | null; loaded: boolean }>()
const m = messages.tv
const clock = computed(() => timeLabel(clockIn(props.now.getTime(), props.timeZone)))
</script>
