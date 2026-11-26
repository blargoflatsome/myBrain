<template>
  <main class="tv-idle" :aria-label="m.nightLabel" data-testid="tv-idle">
    <TvClock class="tv-idle-clock" :now="now" :time-zone="timeZone" data-testid="tv-idle-clock" />
    <section v-if="loaded" class="tv-idle-next" :aria-label="m.upNextLabel" data-testid="tv-idle-next">
      <p class="tv-idle-title" data-testid="tv-idle-next-title">{{ suggestionTitle(next) }}</p>
      <p v-if="suggestionReason(next, timeZone)" class="tv-idle-reason" data-testid="tv-idle-next-reason">{{ suggestionReason(next, timeZone) }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Idle screen: a night screen in muted black and greys, with the time as a large digital clock and the
// Dashboard's Up next under it (its title and short line; no buttons, nothing skipped). Nothing on it is bright.
import type { Suggestion } from '@/dashboard/upNext'
import { suggestionReason, suggestionTitle } from '@/dashboard/upNextText'
import TvClock from '@/tv/screen/components/TvClock.vue'
import { messages } from '@/messages'

defineProps<{ now: Date; timeZone: string; next: Suggestion | null; loaded: boolean }>()
const m = messages.tv
</script>
