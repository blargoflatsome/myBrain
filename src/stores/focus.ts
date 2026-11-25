// The Focus timer's state (SPEC §5 Focus timer). The timer lives on this device only, kept in localStorage so it
// survives reloads; it isn't synced. Only the focus room check-in is sent: once a minute while it runs, and when the
// part changes.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { WORK_MS, catchUp, nextPart, pause, resume, skip, startFocus, type FocusState } from '@/focus/timer'
import { checkIn, leave, type Room } from '@/focus/room'
import { useBrainStore } from '@/stores/brain'
import { deviceTimeZone, todayIn } from '@/time/days'
import { readJson, writeJson } from '@/ui/storage'

const KEY = 'focus-timer'
const TODAY_KEY = 'my-brain:focus-today'
const CHECK_IN_MS = 60_000
/**
 * Parts that end by themselves check in after a random wait of up to this long, so many timers started together
 * don't all check in in the same second (the dots are a minute old anyway). Things I do check in at once.
 */
const SPREAD_MS = 20_000

/** Focus time finished today on this device (SPEC §5 Celebrations), in ms. */
function loadToday(day: string): number {
  const saved = readJson<{ day: string; ms: number }>(TODAY_KEY)
  return saved?.day === day ? saved.ms : 0
}

function load(): { state: FocusState | null; minimized: boolean } {
  const saved = readJson<{ state: FocusState; minimized: boolean }>(KEY)
  // A timer saved while waiting for a wave (before waves were removed, 2026-11-17) isn't running.
  return saved?.state && ['work', 'short', 'long'].includes(saved.state.phase) ? saved : { state: null, minimized: false }
}

const emptyRoom = (): Room => ({ dots: [], together: false })

export const useFocusStore = defineStore('focus', () => {
  const brain = useBrainStore()
  const saved = load()
  /** null when no timer is running. */
  const state = ref<FocusState | null>(saved.state)
  const minimized = ref(saved.minimized)

  watch([state, minimized], () => {
    writeJson(KEY, state.value ? { state: state.value, minimized: minimized.value } : null)
  })

  /** Open the timer: the running one, or start work now. */
  function open(now = Date.now()) {
    if (!state.value) state.value = startFocus(now)
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
  /**
   * Catch up to now. Work that ended by itself is kept here (today's minutes, and the activity for trophies, with
   * Focused together when someone else was in the room); a skipped part never counts. Returns how many parts ended
   * since the last check and how many of them were work, for the screen's chime and words.
   */
  function tick(now = Date.now()): { ended: number; work: number } {
    if (!state.value) return { ended: 0, work: 0 }
    const { state: next, ended } = catchUp(state.value, now)
    let work = 0
    if (ended) {
      let part = { phase: state.value.phase, round: state.value.round }
      for (let i = 0; i < ended; i++) {
        if (part.phase === 'work') work++
        part = nextPart(part.phase, part.round)
      }
      if (work) {
        addFocus(work * WORK_MS, now)
        void brain.finishFocus(work, togetherThisPart)
      }
      endedByItself = true
      state.value = next
    }
    return { ended, work }
  }

  /** Focus time finished today on this device. */
  function focusToday(now = Date.now()): number {
    return loadToday(todayIn(deviceTimeZone(), new Date(now)))
  }
  function addFocus(ms: number, now = Date.now()) {
    const day = todayIn(deviceTimeZone(), new Date(now))
    writeJson(TODAY_KEY, { day, ms: loadToday(day) + ms })
  }

  // ---------- The quiet room ----------
  /** The others in the room, as anonymous dots. Empty when offline: never faked. */
  const room = ref<Room>(emptyRoom())
  let togetherThisPart = false
  let inRoom = false
  let endedByItself = false
  let spread: ReturnType<typeof setTimeout> | null = null

  const canAsk = () => brain.online && !!brain.userId
  async function ask(part: { phase: FocusState['phase']; endsAt: number }) {
    if (!canAsk()) {
      room.value = emptyRoom()
      return
    }
    try {
      const answer = await checkIn(part)
      room.value = answer
      inRoom = true
      if (answer.together && state.value?.phase === 'work') togetherThisPart = true
    } catch {
      room.value = emptyRoom()
    }
  }
  /** Check in with the current part; a paused or stopped timer leaves the room. */
  function report() {
    const s = state.value
    if (s && s.endsAt !== null) return ask({ phase: s.phase, endsAt: s.endsAt })
    if (inRoom && canAsk()) {
      inRoom = false
      void leave().catch(() => {})
    }
    room.value = emptyRoom()
  }

  // A new part, a pause or a stop is sent at once; otherwise once a minute while the timer runs.
  watch(
    () => [state.value?.phase, state.value?.endsAt, state.value?.round],
    ([phase], [before]) => {
      if (phase !== before) togetherThisPart = false
      if (spread) clearTimeout(spread)
      spread = null
      if (endedByItself && state.value) {
        endedByItself = false
        spread = setTimeout(() => {
          spread = null
          void report()
        }, Math.random() * SPREAD_MS)
        return
      }
      endedByItself = false
      void report()
    },
  )
  let ticker: ReturnType<typeof setInterval> | null = null
  watch(
    () => !!state.value,
    (running) => {
      if (running && !ticker) ticker = setInterval(() => {
          if (state.value?.endsAt != null) void report()
        }, CHECK_IN_MS)
      if (!running && ticker) {
        clearInterval(ticker)
        ticker = null
      }
    },
    { immediate: true },
  )
  // A timer still running from before a reload checks in once the app knows who I am.
  watch(
    () => brain.userId,
    (uid) => {
      if (uid && state.value) void report()
    },
    { immediate: true },
  )

  return { state, minimized, open, stop, togglePause, skipPart, tick, focusToday, room }
})
