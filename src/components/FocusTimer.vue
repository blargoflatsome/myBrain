<template>
  <!-- Full screen: black, with only the time and what to do now (SPEC §5 Focus timer). -->
  <div
    v-if="focus.state && !focus.minimized"
    class="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black px-6 text-white"
    role="dialog"
    aria-modal="true"
    :aria-label="m.heading"
    data-testid="focus-timer"
    @keydown.esc.prevent="focus.minimized = true"
  >
    <button type="button" :class="[round, 'absolute top-4 right-4']" :aria-label="m.close" data-testid="focus-close" @click="focus.stop()">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
    <p class="text-2xl font-semibold" data-testid="focus-phase">{{ m.phase[focus.state.phase] }}</p>
    <p class="text-[min(28vw,10rem)] leading-none font-bold tabular-nums" data-testid="focus-time" role="timer" :aria-label="m.timeLeft(time)">{{ time }}</p>
    <p class="text-base text-white/70" data-testid="focus-round">{{ m.round(focus.state.round) }}</p>
    <div class="mt-4 flex flex-wrap justify-center gap-3">
      <button type="button" :class="pill" data-testid="focus-pause" @click="focus.togglePause()">{{ paused ? m.resume : m.pause }}</button>
      <button type="button" :class="pill" @click="focus.skipPart()">{{ m.skip }}</button>
      <button type="button" :class="pill" data-testid="focus-minimize" @click="focus.minimized = true">{{ m.minimize }}</button>
    </div>
  </div>

  <!-- Minimized: a small pill in the bottom-left corner of every page; tap it to open the full screen again. -->
  <button
    v-else-if="focus.state"
    type="button"
    class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-40 md:bottom-[max(1rem,env(safe-area-inset-bottom))] flex min-h-12 items-center gap-2 rounded-full bg-black px-4 font-semibold text-white shadow-lg tabular-nums md:left-60"
    :aria-label="m.openPill(m.phaseShort[focus.state.phase], time)"
    data-testid="focus-pill"
    @click="focus.minimized = false"
  >
    <span class="size-2.5 rounded-full" :class="focus.state.phase === 'work' ? 'bg-prio-high' : 'bg-done'" aria-hidden="true" />
    <span aria-hidden="true">{{ m.phaseShort[focus.state.phase] }} · {{ time }}</span>
  </button>

  <p class="sr-only" aria-live="assertive">{{ announcement }}</p>
</template>

<script setup lang="ts">
// SPEC §5 Focus timer: a full-screen Pomodoro timer that can be minimized to a pill and keeps going.
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useFocusStore } from '@/stores/focus'
import { clock, remainingMs } from '@/focus/timer'
import { messages } from '@/messages'

const focus = useFocusStore()
const m = messages.focus

const now = ref(Date.now())
const time = computed(() => (focus.state ? clock(remainingMs(focus.state, now.value)) : '00:00'))
const paused = computed(() => focus.state?.pausedMs !== null && focus.state?.pausedMs !== undefined)
const announcement = ref('')

function check() {
  now.value = Date.now()
  if (focus.tick(now.value) && focus.state) partEnded()
}
const ticker = setInterval(check, 1000)
const onVisible = () => {
  if (document.visibilityState === 'visible') check()
}
document.addEventListener('visibilitychange', onVisible)
onScopeDispose(() => {
  clearInterval(ticker)
  document.removeEventListener('visibilitychange', onVisible)
})

// When a part ends: a soft chime, a short vibration, and a notification if I'm in another app.
function partEnded() {
  const next = focus.state!.phase
  announcement.value = m.nowPhase[next]
  chime()
  navigator.vibrate?.([200, 100, 200])
  if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
    void navigator.serviceWorker?.ready.then((reg) => reg.showNotification(m.heading, { body: m.notify[next], tag: 'focus-timer' })).catch(() => {})
  }
}
function chime() {
  try {
    const audio = new AudioContext()
    for (const [i, freq] of [660, 880].entries()) {
      const tone = audio.createOscillator()
      const gain = audio.createGain()
      tone.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + i * 0.25 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.25 + 0.4)
      tone.connect(gain).connect(audio.destination)
      tone.start(audio.currentTime + i * 0.25)
      tone.stop(audio.currentTime + i * 0.25 + 0.45)
    }
  } catch {
    // No sound available: the vibration and the screen still show it.
  }
}

// Keep the screen awake while the full-screen timer is showing.
let wakeLock: { release(): Promise<void> } | null = null
watch(
  () => !!focus.state && !focus.minimized,
  async (showing) => {
    if (showing) {
      // Ask once, when the timer starts, so a notification can arrive while I'm in another app.
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {})
      try {
        wakeLock = (await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null
      } catch {
        wakeLock = null
      }
    } else {
      await wakeLock?.release().catch(() => {})
      wakeLock = null
    }
  },
  { immediate: true },
)

const round = 'flex size-12 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white'
const pill = 'min-h-12 rounded-full border border-white/40 px-5 font-semibold text-white hover:bg-white/10'
</script>
