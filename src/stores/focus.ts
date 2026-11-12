// The Focus timer's state (SPEC §5 Focus timer). It lives on this device only, kept in localStorage so it survives
// reloads; it isn't synced.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { WORK_MS, catchUp, nextPart, pause, resume, skip, startFocus, type FocusState } from '@/focus/timer'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { readJson, writeJson } from '@/ui/storage'

const KEY = 'focus-timer'
const TODAY_KEY = 'my-brain:focus-today'

/** Focus time finished today on this device (SPEC §5 Celebrations), in ms. */
function loadToday(day: string): number {
  const saved = readJson<{ day: string; ms: number }>(TODAY_KEY)
  return saved?.day === day ? saved.ms : 0
}

function load(): { state: FocusState | null; minimized: boolean } {
  const saved = readJson<{ state: FocusState; minimized: boolean }>(KEY)
  return saved?.state ? saved : { state: null, minimized: false }
}

export const useFocusStore = defineStore('focus', () => {
  const saved = load()
  /** null when no timer is running. */
  const state = ref<FocusState | null>(saved.state)
  const minimized = ref(saved.minimized)

  watch([state, minimized], () => {
    writeJson(KEY, state.value ? { state: state.value, minimized: minimized.value } : null)
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
  /** Catch up to now; returns how many parts ended since the last check, and how many of them were work. */
  function tick(now = Date.now()): number {
    if (!state.value) return 0
    const { state: next, ended } = catchUp(state.value, now)
    if (ended) {
      let part = { phase: state.value.phase, round: state.value.round }
      let work = 0
      for (let i = 0; i < ended; i++) {
        if (part.phase === 'work') work++
        part = nextPart(part.phase, part.round)
      }
      if (work) addFocus(work * WORK_MS, now)
      workEnded.value = work
      state.value = next
    }
    return ended
  }

  /** Work parts that ended at the last tick (a skipped part never counts). */
  const workEnded = ref(0)
  /** Focus time finished today on this device. */
  function focusToday(now = Date.now()): number {
    return loadToday(todayIn(deviceTimeZone(), new Date(now)))
  }
  function addFocus(ms: number, now = Date.now()) {
    const day = todayIn(deviceTimeZone(), new Date(now))
    writeJson(TODAY_KEY, { day, ms: loadToday(day) + ms })
  }
  return { state, minimized, start, stop, togglePause, skipPart, tick, workEnded, focusToday }
})
