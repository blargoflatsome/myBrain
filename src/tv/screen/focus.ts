// SPEC §9 TV app, Focus timer: the §5 Focus timer on the TV, with the same parts, controls, chime and quiet room.
// Like on any device it lives on the TV only (kept in its storage, so a reload keeps it). The room check-ins and the
// finished work sessions (they count for trophies, 2026-11-26, user) go through the TV's own server calls.
import { computed, onScopeDispose, ref, watch } from 'vue'
import { catchUp, clock, pause, remainingMs, resume, skip, startFocus, workPartsEnded, type FocusState } from '@/focus/timer'
import { checkIn, leave } from '@/focus/room'
import { useRoomCheckIns } from '@/focus/roomCheckIns'
import { chime } from '@/focus/chime'
import { serverCall } from '@/server/server'
import { readJson, writeJson } from '@/ui/storage'
import { messages } from '@/messages'

const KEY = 'my-brain:tv-focus'
const m = messages.focus

export function useTvFocus(deviceKey: () => string | null) {
  const saved = readJson<{ state: FocusState; minimized: boolean }>(KEY)
  const state = ref<FocusState | null>(saved?.state ?? null)
  const minimized = ref(!!saved?.minimized)
  watch([state, minimized], () => writeJson(KEY, state.value ? { state: state.value, minimized: minimized.value } : null))

  const now = ref(Date.now())
  /** Shown full screen (open and not minimized). */
  const showing = computed(() => !!state.value && !minimized.value)
  const time = computed(() => (state.value ? clock(remainingMs(state.value, now.value)) : '00:00'))
  const paused = computed(() => !!state.value && state.value.pausedMs !== null)
  /** What screen readers hear when a part ends ("Time for a short break."). */
  const announcement = ref('')

  const device = () => ({ device_key: deviceKey() })
  const checkIns = useRoomCheckIns(state, {
    canAsk: () => !!deviceKey() && (typeof navigator === 'undefined' || navigator.onLine),
    checkIn: (part) => checkIn(part, 'tv_focus_room', device()),
    leave: () => leave('tv_focus_leave', device()),
  })

  /** Open the timer: the running one, or start work now. */
  function open() {
    if (!state.value) state.value = startFocus(Date.now())
    minimized.value = false
  }
  function stop() {
    state.value = null
    minimized.value = false
  }
  function minimize() {
    minimized.value = true
  }
  function togglePause() {
    if (state.value) state.value = state.value.pausedMs === null ? pause(state.value, Date.now()) : resume(state.value, Date.now())
  }
  function skipPart() {
    if (state.value) state.value = skip(state.value, Date.now())
  }

  /** Catch up to now; each work part that ended by itself is kept for trophies (a skipped part never counts). */
  function tick() {
    now.value = Date.now()
    if (!state.value) return
    const { state: next, ended } = catchUp(state.value, now.value)
    if (!ended) return
    const work = workPartsEnded(state.value, ended)
    const together = checkIns.together()
    for (let i = 0; i < work; i++) {
      const args = { ...device(), id: crypto.randomUUID(), at: new Date(now.value).toISOString(), together }
      // Out of reach, that session just isn't kept: the timer goes on.
      void serverCall('tv_log_focus', args).catch(() => {})
    }
    checkIns.endingByItself()
    state.value = next
    // No celebration on the TV (SPEC §9): just the new part.
    announcement.value = m.nowPhase[next.phase]
    chime()
  }
  const ticker = setInterval(tick, 1000)
  onScopeDispose(() => clearInterval(ticker))
  // A timer still running from before a reload catches up and checks in.
  if (state.value) {
    tick()
    void checkIns.report()
  }

  return { state, minimized, showing, time, paused, announcement, room: checkIns.room, now, open, stop, minimize, togglePause, skipPart }
}

export type TvFocus = ReturnType<typeof useTvFocus>
