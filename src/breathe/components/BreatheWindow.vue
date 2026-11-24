<template>
  <!-- SPEC §5 Breathe: a full-screen window, a 5-minute timer inside a ring that grows as I breathe in and shrinks as I
       breathe out. A real window (showModal), so it opens above the Focus timer or anything else that's open. -->
  <dialog
    ref="dialog"
    class="m-0 h-dvh max-h-none w-full max-w-none flex-col items-center justify-center gap-8 border-0 bg-bg px-6 text-ink open:flex"
    :aria-label="m.heading"
    data-testid="breathe"
    @close="breathe.close()"
  >
    <template v-if="breathe.state">
      <div class="relative grid size-[min(18rem,80vw)] place-items-center">
        <!-- The ring follows the same 4 s in, 6 s out as the words (style.css); reduce motion keeps it still. -->
        <span
          :key="ringKey"
          class="breathe-ring absolute inset-0 rounded-full border-4 border-accent bg-accent/10"
          :class="{ 'breathe-ring-paused': paused || breathe.finished }"
          aria-hidden="true"
        />
        <div class="relative flex flex-col items-center gap-2 text-center">
          <!-- Not read out on every breath (SPEC §5 Breathe); screen readers hear the start and the end. -->
          <p class="text-2xl font-semibold" aria-hidden="true" data-testid="breathe-word">{{ breathe.finished ? m.doneShort : m[breath] }}</p>
          <p class="text-4xl font-bold tabular-nums" role="timer" :aria-label="m.timeLeft(time)" data-testid="breathe-time">{{ time }}</p>
        </div>
      </div>
      <p v-if="breathe.finished" class="max-w-md text-center text-lg" data-testid="breathe-done">{{ m.done }}</p>
      <div class="flex flex-wrap justify-center gap-3">
        <button v-if="!breathe.finished" type="button" :class="secondaryButton" data-testid="breathe-pause" autofocus @click="breathe.togglePause()">
          {{ paused ? m.resume : m.pause }}
        </button>
        <button v-else type="button" :class="primaryButton" data-testid="breathe-finish" autofocus @click="dialog?.close()">{{ m.finish }}</button>
      </div>
      <CloseX :label="m.close" @click="dialog?.close()" />
    </template>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import CloseX from '@/components/CloseX.vue'
import { useBrainStore } from '@/stores/brain'
import { breathAt, leftMs } from '@/breathe/breathe'
import { clock } from '@/focus/timer'
import { useBreatheStore } from '@/stores/breathe'
import { useWakeLock } from '@/composables/useWakeLock'
import { primaryButton, secondaryButton } from '@/ui/styles'
import { messages } from '@/messages'

const brain = useBrainStore()

const breathe = useBreatheStore()
const m = messages.breathe

const now = ref(Date.now())
const time = computed(() => clock(breathe.state ? leftMs(breathe.state, now.value) : 0))
const breath = computed(() => (breathe.state ? breathAt(breathe.state, now.value) : 'in'))
const paused = computed(() => breathe.state?.pausedMs != null)
const announcement = ref('')
// A fresh ring each time Breathe opens, so its first breath starts with the words.
const ringKey = ref(0)

const dialog = ref<HTMLDialogElement | null>(null)
const showing = computed(() => !!breathe.state)
watch(
  [showing, dialog],
  async ([show, el]) => {
    if (!el) return
    if (show && !el.open) {
      ringKey.value++
      el.showModal()
      announcement.value = ''
      await nextTick()
      announcement.value = m.started
    } else if (!show && el.open) el.close()
  },
  { immediate: true, flush: 'post' },
)

// A quarter-second tick keeps the words in step with the ring.
let ticker: ReturnType<typeof setInterval> | undefined
watch(
  showing,
  (show) => {
    clearInterval(ticker)
    if (!show) return
    now.value = Date.now()
    ticker = setInterval(() => {
      now.value = Date.now()
      if (breathe.tick(now.value)) {
        announcement.value = m.done
        navigator.vibrate?.(200)
        // Kept for its trophies (SPEC §5 Breathe): only a finished 5 minutes, never one stopped early.
        void brain.finishBreathe()
      }
    }, 250)
  },
  { immediate: true },
)
onScopeDispose(() => clearInterval(ticker))

useWakeLock(() => showing.value && !breathe.finished)
</script>
