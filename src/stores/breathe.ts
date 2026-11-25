// SPEC §5 Breathe: whether Breathe is open, so the header, the Focus timer and I'm stuck can all open the one window.
// It lives on this device only and isn't saved; nothing is shared.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { leftMs, pauseBreathe, resumeBreathe, startBreathe, type BreatheState } from '@/breathe/breathe'

export const useBreatheStore = defineStore('breathe', () => {
  const brain = useBrainStore()
  /** null when Breathe is closed. */
  const state = ref<BreatheState | null>(null)
  /** The 5 minutes are up. */
  const finished = ref(false)

  function open() {
    state.value = startBreathe(Date.now())
    finished.value = false
  }
  function close() {
    state.value = null
    finished.value = false
  }
  function togglePause() {
    if (!state.value || finished.value) return
    const now = Date.now()
    state.value = state.value.pausedMs === null ? pauseBreathe(state.value, now) : resumeBreathe(state.value, now)
  }
  /**
   * Call often; true once, when the 5 minutes run out. That finish is kept for its trophies (SPEC §5 Breathe): only a
   * finished 5 minutes, never one paused or closed early.
   */
  function tick(now: number): boolean {
    if (!state.value || finished.value || state.value.pausedMs !== null || leftMs(state.value, now) > 0) return false
    finished.value = true
    void brain.finishBreathe()
    return true
  }

  return { state, finished, open, close, togglePause, tick }
})
