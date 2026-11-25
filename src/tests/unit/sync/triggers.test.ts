import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REALTIME_WAIT_MS, RETRY_MS, startSyncTriggers, type Surroundings } from '@/sync/triggers'
import type { SyncTable } from '@/sync/types'

// What the sync engine was asked to do, in order. The triggers save nothing themselves, so these asks are their
// whole outcome, not a detail of how they work.
let asked: string[]
let pending: number
let online: boolean[]
let caughtUp: number
let fromRealtime: ((table: SyncTable) => void) | null
let unsubscribed: boolean
let page: { window: EventTarget; document: EventTarget & { visibilityState: DocumentVisibilityState } }
let stop: () => void

const engine = {
  sync: async () => void asked.push('sync'),
  flush: async () => void asked.push('flush'),
  pull: async (tables?: readonly SyncTable[]) => void asked.push(`pull ${tables?.join(',')}`),
  getStatus: () => ({ state: 'synced' as const, pending }),
}

function shown(state: DocumentVisibilityState) {
  page.document.visibilityState = state
  page.document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  asked = []
  pending = 0
  online = []
  caughtUp = 0
  fromRealtime = null
  unsubscribed = false
  page = { window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState }) }
  const remote = {
    subscribe: (onChange: (table: SyncTable) => void) => {
      fromRealtime = onChange
      return () => void (unsubscribed = true)
    },
  }
  stop = startSyncTriggers(
    { engine, remote, onlineChanged: (now) => void online.push(now), caughtUp: async () => void caughtUp++ },
    page as Surroundings,
  )
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('SPEC §7 Sync on reconnect', () => {
  it('coming back online says so, catches up, then counts as a finished download; going offline uploads what it can', async () => {
    page.window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(caughtUp).toBe(1))
    page.window.dispatchEvent(new Event('offline'))
    expect(online).toEqual([true, false])
    expect(asked).toEqual(['sync', 'flush'])
  })
})

describe('SPEC §7 Catching up and not leaving changes behind', () => {
  it('coming back to the app catches up; switching away or leaving the page uploads what is queued', () => {
    shown('hidden')
    shown('visible')
    page.window.dispatchEvent(new Event('pagehide'))
    expect(asked).toEqual(['flush', 'sync', 'flush'])
  })

  it('changes still queued are retried every 30 seconds while the app is open, and only then', () => {
    vi.advanceTimersByTime(RETRY_MS)
    expect(asked).toEqual([]) // nothing queued
    pending = 2
    shown('hidden')
    asked = []
    vi.advanceTimersByTime(RETRY_MS)
    expect(asked).toEqual([]) // the app isn't open
    page.document.visibilityState = 'visible'
    vi.advanceTimersByTime(RETRY_MS - 1)
    expect(asked).toEqual([])
    vi.advanceTimersByTime(1)
    expect(asked).toEqual(['sync'])
  })
})

describe('SPEC §7 Sync via Realtime', () => {
  it('several changes to a table in a row download it once, after a short wait; each table on its own', () => {
    fromRealtime!('journal_entries')
    vi.advanceTimersByTime(REALTIME_WAIT_MS - 1)
    fromRealtime!('journal_entries')
    fromRealtime!('tasks')
    vi.advanceTimersByTime(REALTIME_WAIT_MS - 1)
    expect(asked).toEqual([])
    vi.advanceTimersByTime(1)
    expect(asked).toEqual(['pull journal_entries', 'pull tasks'])
  })
})

describe('SPEC §8 Sign out: stop syncing', () => {
  it('after signing out nothing syncs: no events, no retry, no download waiting, no Realtime', () => {
    pending = 1
    fromRealtime!('tasks')
    stop()
    page.window.dispatchEvent(new Event('online'))
    shown('hidden')
    page.window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(RETRY_MS)
    expect(asked).toEqual([])
    expect(online).toEqual([])
    expect(unsubscribed).toBe(true)
  })
})
