// The Focus timer's state (SPEC §5 Focus timer). It lives on this device only, kept in localStorage so it survives
// reloads; it isn't synced.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { catchUp, pause, resume, skip, startFocus, type FocusState } from '@/focus/timer'

const KEY = 'focus-timer'

function load(): { state: FocusState | null; minimized: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { state: FocusState; minimized: boolean } | null
    return saved?.state ? saved : { state: null, minimized: false }
  } catch {
    return { state: null, minimized: false }
  }
}

export const useFocusStore = defineStore('focus', () => {
  const saved = load()
  /** null when no timer is running. */
  const state = ref<FocusState | null>(saved.state)
  const minimized = ref(saved.minimized)

  watch([state, minimized], () => {
    try {
      if (state.value) localStorage.setItem(KEY, JSON.stringify({ state: state.value, minimized: minimized.value }))
      else localStorage.removeItem(KEY)
    } catch {
      // Storage not available (private window): the timer just won't survive a reload.
    }
  })

  function start() {
    if (!state.value) state.value = startFocus(Date.now())
    minimized.value = false
  }
  function stop() {
    state.value = null
    minimized.value = false
  }
  function togglePause() {
    if (!state.value) return
    state.value = state.value.pausedMs === null ? pause(state.value, Date.now()) : resume(state.value, Date.now())
  }
  function skipPart() {
    if (state.value) state.value = skip(state.value, Date.now())
  }
  /** Catch up to now; returns how many parts ended since the last check. */
  function tick(now = Date.now()): number {
    if (!state.value) return 0
    const { state: next, ended } = catchUp(state.value, now)
    if (ended) state.value = next
    return ended
  }
  return { state, minimized, start, stop, togglePause, skipPart, tick }
})
