// SPEC §5 Focus timer, the quiet room: when a running timer checks in. Once a minute while it runs, at once when I
// change the part (Start, Skip, Pause), and after a random wait of up to 20 seconds when a part ends by itself, so
// timers started together don't all check in in the same second. A paused or stopped timer leaves the room. Shared by
// the app's Focus timer and the TV's (SPEC §9), which differ only in how they reach the server.
import { ref, watch, type Ref } from 'vue'
import type { FocusState } from '@/focus/timer'
import type { Room } from '@/focus/room'

const CHECK_IN_MS = 60_000
const SPREAD_MS = 20_000

export interface RoomServer {
  /** Whether a check-in can be sent now (online, and signed in or paired). */
  canAsk(): boolean
  checkIn(part: { phase: FocusState['phase']; endsAt: number }): Promise<Room>
  leave(): Promise<void>
}

const emptyRoom = (): Room => ({ dots: [], together: false })

export function useRoomCheckIns(state: Ref<FocusState | null>, server: RoomServer) {
  /** The others in the room, as anonymous dots. Empty when offline: never faked. */
  const room = ref<Room>(emptyRoom())
  /** Someone else was in the room during this work part, while I was shown (Focused together). */
  let togetherThisPart = false
  let inRoom = false
  let endedByItself = false
  let spread: ReturnType<typeof setTimeout> | null = null

  async function ask(part: { phase: FocusState['phase']; endsAt: number }) {
    if (!server.canAsk()) {
      room.value = emptyRoom()
      return
    }
    try {
      const answer = await server.checkIn(part)
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
    if (inRoom && server.canAsk()) {
      inRoom = false
      void server.leave().catch(() => {})
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
      if (running && !ticker)
        ticker = setInterval(() => {
          if (state.value?.endsAt != null) void report()
        }, CHECK_IN_MS)
      if (!running && ticker) {
        clearInterval(ticker)
        ticker = null
      }
    },
    { immediate: true },
  )

  return {
    room,
    report,
    /** Whether this work part counts for Focused together; read before the part moves on. */
    together: () => togetherThisPart,
    /** The part is about to end by itself: its check-in waits a random moment. */
    endingByItself: () => (endedByItself = true),
  }
}
