import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { useFocusStore } from '@/stores/focus'
import { useBreatheStore } from '@/stores/breathe'
import { checkIn } from '@/focus/room'
import { FakeRemote } from '@/tests/support/fakeRemote'

// The focus room is a server call; here it answers whether someone else is in the room.
vi.mock('@/focus/room', () => ({ checkIn: vi.fn(), leave: vi.fn(async () => {}) }))

const UID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-12T12:00:00Z').getTime()
const MIN = 60_000

let brain: ReturnType<typeof useBrainStore>
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  setActivePinia(createPinia())
  localStorage.clear()
  vi.mocked(checkIn).mockResolvedValue({ dots: [], together: false })
  brain = useBrainStore()
  brain.start(UID, new FakeRemote())
  await vi.waitFor(() => expect(brain.syncedCount).toBeGreaterThan(0))
})
afterEach(async () => {
  vi.useRealTimers()
  const db = brain.db
  brain.stop()
  await db?.delete()
})
const activity = async () => {
  await brain.trophiesIdle()
  return (await brain.db!.activity_log.toArray()).map((a) => ({ kind: a.kind, detail: a.detail }))
}

describe('SPEC §5 Focus timer: work that ends by itself is kept, without the timer on screen', () => {
  it('a work part counts once, as Focused together when someone else was in the room', async () => {
    vi.mocked(checkIn).mockResolvedValue({ dots: [], together: true })
    const focus = useFocusStore()
    focus.open(NOW)
    await vi.waitFor(() => expect(focus.room.together).toBe(true))
    expect(focus.tick(NOW + 25 * MIN)).toEqual({ ended: 1, work: 1 })
    focus.tick(NOW + 25 * MIN + 1000)
    await vi.waitFor(async () => expect(await activity()).toEqual([{ kind: 'focus', detail: { minutes: 25, together: true } }]))
  })

  it('every work part that ended while the app was away counts, and the breaks between them never do', async () => {
    const focus = useFocusStore()
    focus.open(NOW)
    // Work, a short break, work, then a minute into the next break.
    expect(focus.tick(NOW + 56 * MIN)).toEqual({ ended: 3, work: 2 })
    expect(focus.focusToday(NOW + 56 * MIN)).toBe(50 * MIN)
    await vi.waitFor(async () => expect(await activity()).toHaveLength(2))
    expect(await activity()).toEqual([{ kind: 'focus', detail: { minutes: 25 } }, { kind: 'focus', detail: { minutes: 25 } }])
  })

  it('a skipped work part never counts', async () => {
    const focus = useFocusStore()
    focus.open(NOW)
    focus.skipPart()
    expect(focus.tick(Date.now() + 5 * MIN)).toEqual({ ended: 1, work: 0 })
    expect(await activity()).toEqual([])
    expect(focus.focusToday()).toBe(0)
  })
})

describe('SPEC §5 Breathe: only a finished 5 minutes is kept for its trophies', () => {
  it('a finished Breathe counts once, however often it is checked after', async () => {
    const breathe = useBreatheStore()
    breathe.open()
    const opened = Date.now()
    expect(breathe.tick(opened + 5 * MIN)).toBe(true)
    expect(breathe.tick(opened + 6 * MIN)).toBe(false)
    await vi.waitFor(async () => expect(await activity()).toEqual([{ kind: 'breathe', detail: {} }]))
  })

  it.each([
    { what: 'paused', end: (b: ReturnType<typeof useBreatheStore>) => b.togglePause() },
    { what: 'closed early', end: (b: ReturnType<typeof useBreatheStore>) => b.close() },
  ])('one $what never counts', async ({ end }) => {
    const breathe = useBreatheStore()
    breathe.open()
    end(breathe)
    expect(breathe.tick(Date.now() + 10 * MIN)).toBe(false)
    expect(await activity()).toEqual([])
  })
})
