<template>
  <main class="tv-focus" :aria-label="m.heading" data-testid="tv-focus">
    <!-- SPEC §5 Focus timer, the quiet room: a faint dot for each other person focusing now; no count, no names.
         Screen readers hear one line instead. -->
    <div class="tv-focus-room" aria-hidden="true" data-testid="tv-focus-room">
      <span
        v-for="dot in focus.room.value.dots"
        :key="dot.id"
        class="tv-focus-dot"
        :class="{ 'tv-focus-dot-glow': glowing(dot, focus.now.value) }"
        :style="{ left: `${dotPlace(dot.id).x}%`, top: `${dotPlace(dot.id).y}%` }"
        data-testid="tv-focus-dot"
      />
    </div>
    <p v-if="focus.room.value.dots.length" class="tv-sr-only">{{ m.othersHere }}</p>

    <button type="button" class="tv-button tv-focus-close" :aria-label="m.close" data-testid="tv-focus-close" @click="focus.stop()">✕</button>
    <template v-if="focus.state.value">
      <p class="tv-focus-phase" data-testid="tv-focus-phase">{{ m.phase[focus.state.value.phase] }}</p>
      <p class="tv-focus-time" role="timer" :aria-label="m.timeLeft(focus.time.value)" data-testid="tv-focus-time">{{ focus.time.value }}</p>
      <p class="tv-focus-round" data-testid="tv-focus-round">{{ m.round(focus.state.value.round) }}</p>
      <div class="tv-focus-buttons">
        <button ref="pauseButton" type="button" class="tv-button tv-focus-button" data-testid="tv-focus-pause" @click="focus.togglePause()">
          {{ focus.paused.value ? m.resume : m.pause }}
        </button>
        <button type="button" class="tv-button tv-focus-button" data-testid="tv-focus-skip" @click="focus.skipPart()">{{ m.skip }}</button>
        <button type="button" class="tv-button tv-focus-button" data-testid="tv-focus-minimize" @click="focus.minimize()">{{ m.minimize }}</button>
      </div>
    </template>
    <p class="tv-sr-only" aria-live="assertive">{{ focus.announcement.value }}</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Focus timer: the §5 Focus timer full screen on the TV. Black, with the time, what to do now and the
// round, Pause / Resume, Skip, Minimize and ✕, and the quiet room's dots. While it shows the TV is kept awake and the
// night screen is held off. Back minimizes it, like Escape in the app.
import { inject, onMounted, onScopeDispose, ref } from 'vue'
import { dotPlace, glowing } from '@/focus/room'
import { useWakeLock } from '@/composables/useWakeLock'
import { IDLE_HOLD } from '@/tv/screen/idle'
import { keepTvAwake } from '@/tv/screen/awake'
import type { TvFocus } from '@/tv/screen/focus'
import { messages } from '@/messages'

defineProps<{ focus: TvFocus }>()
const m = messages.focus

const hold = inject(IDLE_HOLD, () => {})
hold(true)
keepTvAwake(true)
useWakeLock(() => true)
onScopeDispose(() => {
  hold(false)
  keepTvAwake(false)
})

const pauseButton = ref<HTMLButtonElement | null>(null)
onMounted(() => pauseButton.value?.focus())
</script>
