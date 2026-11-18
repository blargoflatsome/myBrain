<template>
  <!-- Full screen: black, with only the time and what to do now (SPEC §5 Focus timer). A real window (showModal), so it
       sits above any other window and the page behind is inert; Escape minimizes it. -->
  <dialog
    ref="dialog"
    class="m-0 h-dvh max-h-none w-full max-w-none flex-col items-center justify-center gap-6 border-0 bg-black px-6 text-white open:flex"
    :aria-label="m.heading"
    data-testid="focus-timer"
    @close="onClose"
  >
    <!-- SPEC §5 Focus timer, the quiet room: a faint dot for each other person focusing now; no count, no names.
         Screen readers hear one line instead. -->
    <div v-if="showing" class="pointer-events-none absolute inset-0" aria-hidden="true" data-testid="focus-room">
      <span
        v-for="dot in focus.room.dots"
        :key="dot.id"
        class="absolute size-2 -translate-1/2 rounded-full bg-white transition-[opacity,box-shadow] duration-1000 motion-reduce:transition-none"
        :class="glowing(dot, now) ? 'opacity-70 shadow-[0_0_12px_4px_rgb(255_255_255/0.35)]' : 'opacity-20'"
        :style="{ left: `${dotPlace(dot.id).x}%`, top: `${dotPlace(dot.id).y}%` }"
        data-testid="focus-dot"
      />
    </div>
    <p v-if="showing && focus.room.dots.length" class="sr-only">{{ m.othersHere }}</p>

    <template v-if="showing && focus.state">
      <button type="button" :class="[round, 'absolute top-4 right-4']" :aria-label="m.close" data-testid="focus-close" @click="focus.stop()">
        <AppIcon name="close" size="size-7" />
      </button>
      <p class="relative text-2xl font-semibold" data-testid="focus-phase">{{ m.phase[focus.state.phase] }}</p>
      <p class="relative text-[min(28vw,10rem)] leading-none font-bold tabular-nums" data-testid="focus-time" role="timer" :aria-label="m.timeLeft(time)">{{ time }}</p>
      <p class="relative text-base text-white/70" data-testid="focus-round">{{ m.round(focus.state.round) }}</p>
      <!-- SPEC §5 Celebrations: after a work part, a soft ripple and how much I've focused today. -->
      <span v-if="rippling" :key="rippleKey" class="celebrate-ripple pointer-events-none absolute top-1/2 left-1/2 -mt-32 -ml-32 size-64 rounded-full border-4 border-done" aria-hidden="true" />
      <p v-if="focusedToday" class="relative text-base font-semibold text-done" data-testid="focus-today">{{ messages.celebrations.focusToday(focusedToday) }}</p>
      <div class="relative mt-4 flex flex-wrap justify-center gap-3">
        <button type="button" :class="pill" data-testid="focus-pause" autofocus @click="focus.togglePause()">{{ paused ? m.resume : m.pause }}</button>
        <button type="button" :class="pill" @click="focus.skipPart()">{{ m.skip }}</button>
        <button type="button" :class="pill" data-testid="focus-minimize" @click="focus.minimized = true">{{ m.minimize }}</button>
      </div>
    </template>
  </dialog>

  <!-- Minimized: a small pill in the bottom-left corner of every page; tap it to open the full screen again. -->
  <button
    v-if="focus.state && focus.minimized"
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
import AppIcon from '@/components/AppIcon.vue'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useFocusStore } from '@/stores/focus'
import { clock, remainingMs } from '@/focus/timer'
import { dotPlace, glowing } from '@/focus/room'
import { messages } from '@/messages'
import { achieved } from '@/celebrate/bus'
import { useWakeLock } from '@/composables/useWakeLock'

const focus = useFocusStore()
const m = messages.focus

const now = ref(Date.now())
const time = computed(() => (focus.state ? clock(remainingMs(focus.state, now.value)) : '00:00'))
const paused = computed(() => focus.state?.pausedMs !== null && focus.state?.pausedMs !== undefined)
const announcement = ref('')

const dialog = ref<HTMLDialogElement | null>(null)
const showing = computed(() => !!focus.state && !focus.minimized)
// Open and close the window with the timer; Escape (or the browser closing it) minimizes the timer, never stops it.
watch(
  [showing, dialog],
  ([show, el]) => {
    if (!el) return
    if (show && !el.open) el.showModal()
    else if (!show && el.open) el.close()
  },
  { immediate: true, flush: 'post' },
)
function onClose() {
  if (showing.value) focus.minimized = true
}

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

// Minutes of focus finished today, shown once there are some.
const focusedToday = ref(Math.round(focus.focusToday() / 60_000))
const rippling = ref(false)
const rippleKey = ref(0)

// When a part ends: a soft chime, a short vibration, and a notification if I'm in another app.
function partEnded() {
  const next = focus.state!.phase
  announcement.value = m.nowPhase[next]
  if (focus.workEnded) {
    focusedToday.value = Math.round(focus.focusToday() / 60_000)
    announcement.value = `${messages.celebrations.focusDone} ${m.nowPhase[next]}`
    rippling.value = true
    rippleKey.value++
    setTimeout(() => (rippling.value = false), 1500)
    achieved({ kind: 'focus', sessions: focus.workEnded, together: focus.workTogether })
  }
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
useWakeLock(() => showing.value)
// Ask once, when the timer starts, so a notification can arrive while I'm in another app.
watch(
  showing,
  (isShowing) => {
    if (isShowing && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {})
  },
  { immediate: true },
)

const round = 'flex size-12 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white'
const pill = 'min-h-12 rounded-full border border-white/40 px-5 font-semibold text-white hover:bg-white/10'
</script>
