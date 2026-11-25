import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Dexie from 'dexie'
import { useBrainStore } from '@/stores/brain'
import { useSessionStore } from '@/stores/session'
import { readKey, writeKey } from '@/ui/storage'
import type { TaskRow } from '@/sync/types'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { FakeServer } from '@/tests/support/fakeServer'
import { FakeSession } from '@/tests/support/fakeSession'

let remote: FakeRemote
let server: FakeServer
let fake: FakeSession
let restore: (() => void)[] = []
let uid: string
const REMEMBERED = 'my-brain:appearance'

beforeEach(() => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
  server = new FakeServer()
  fake = new FakeSession(remote)
  restore = [server.use(), fake.use()]
  uid = `u-${crypto.randomUUID()}`
})

afterEach(async () => {
  restore.forEach((r) => r())
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
  await Dexie.delete(`my-brain-${uid}`)
  localStorage.clear()
})

/** Signed in, with the first download done. */
async function signedIn() {
  const session = useSessionStore()
  const brain = useBrainStore()
  session.begin()
  fake.signIn(uid)
  await vi.waitFor(() => expect(brain.syncedCount).toBeGreaterThan(0))
  return { session, brain }
}

const task = (title: string): TaskRow => ({ id: crypto.randomUUID(), user_id: uid, title, due_date: null, status: 'open', source: 'manual', deleted_at: null })
const deviceCopyExists = () => Dexie.exists(`my-brain-${uid}`)

describe('SPEC §8 Sign out: nothing of mine stays on this device', () => {
  it('uploads what is waiting, then deletes my data and what the app remembered here, and signs out', async () => {
    const { session, brain } = await signedIn()
    const t = await brain.addTask('Buy stamps', null)
    writeKey(REMEMBERED, 'dark')

    expect(await session.signOut()).toBe(0)

    expect(remote.tables.tasks.get(t!.id)).toMatchObject({ title: 'Buy stamps' })
    expect(await deviceCopyExists()).toBe(false)
    expect(readKey(REMEMBERED)).toBeNull()
    expect(fake.signedOut).toEqual(['global'])
  })

  it('offline, changes that can’t upload hold it back until I say to throw them away', async () => {
    const { session, brain } = await signedIn()
    remote.online = false
    await brain.addTask('Buy stamps', null)

    expect(await session.signOut()).toBe(1)
    expect(fake.signedOut).toEqual([])
    expect(brain.userId).toBe(uid)

    expect(await session.signOut(true)).toBe(0)
    expect(fake.signedOut).toEqual(['global'])
    expect(await deviceCopyExists()).toBe(false)
  })
})

describe('SPEC §8 Delete my data on another device: this device clears its copy and downloads again', () => {
  it('a newer reset time on my profile clears what was deleted there', async () => {
    const gone = task('Deleted elsewhere')
    const kept = task('Kept')
    await remote.upsert('tasks', gone)
    await remote.upsert('tasks', kept)
    const { session, brain } = await signedIn()
    expect(await brain.db!.tasks.get(gone.id)).toBeTruthy()

    remote.tables.tasks.delete(gone.id)
    fake.profile = { ...fake.profile, data_reset_at: '2026-11-24T12:00:00Z' }
    expect(await session.checkDataReset()).toBe(true)

    await vi.waitFor(async () => expect(await brain.db!.tasks.get(kept.id)).toBeTruthy())
    expect(await brain.db!.tasks.get(gone.id)).toBeUndefined()
    expect(await session.checkDataReset()).toBe(false)
  })
})

describe('SPEC §5 Account page, §8 Delete My Account', () => {
  it('when it fails, nothing is deleted and syncing carries on', async () => {
    const { session, brain } = await signedIn()
    const t = await brain.addTask('Buy stamps', null)
    server.fails.delete_my_account = 'offline'

    expect(await session.deleteAccount()).toBe(false)

    expect(brain.userId).toBe(uid)
    expect(await brain.db!.tasks.get(t!.id)).toBeTruthy()
    expect(fake.signedOut).toEqual([])
  })

  it('once deleted, this device forgets everything, as Sign out does, and signs out here only', async () => {
    const { session } = await signedIn()
    writeKey(REMEMBERED, 'dark')

    expect(await session.deleteAccount()).toBe(true)

    expect(server.calls.map((c) => c.fn)).toContain('delete_my_account')
    expect(await deviceCopyExists()).toBe(false)
    expect(readKey(REMEMBERED)).toBeNull()
    expect(fake.pushForgotten).toBe(true)
    expect(fake.signedOut).toEqual(['local'])
  })
})

describe('SPEC §7 Offline and sync: signing in opens my data and starts syncing', () => {
  it('a start that failed (what it needed didn’t download) is tried again when I come back to the app', async () => {
    const brain = useBrainStore()
    vi.spyOn(fake, 'remote').mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useSessionStore().begin()
    fake.signIn(uid)
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(brain.userId).not.toBe(uid)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(brain.syncedCount).toBeGreaterThan(0))
    expect(brain.userId).toBe(uid)
  })
})
