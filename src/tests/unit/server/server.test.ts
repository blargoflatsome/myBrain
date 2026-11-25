import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { reasonOf } from '@/server/server'
import { newEvent } from '@/events/rules'
import type { EventInviteRow, VaultBucketRow, VaultShareRow } from '@/sync/types'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { FakeServer } from '@/tests/support/fakeServer'

let remote: FakeRemote
let server: FakeServer
let restore: () => void
const me = `u-${crypto.randomUUID()}`

beforeEach(async () => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
  server = new FakeServer()
  restore = server.use()
})

afterEach(async () => {
  restore()
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
})

/** Signed in, with the first download done, so only the call under test can bring rows down. */
async function signedIn() {
  const brain = useBrainStore()
  brain.start(me, remote)
  await vi.waitFor(() => expect(brain.syncedCount).toBeGreaterThan(0))
  return brain
}

const invite = (eventId: string): EventInviteRow => ({ id: crypto.randomUUID(), user_id: me, event_id: eventId, name: 'Sam', response: 'pending', deleted_at: null })

describe('SPEC §7 Things only the server can do: my copy is brought up to date when one goes through', () => {
  it('inviting people uploads my new event first, then my copy shows the invitations', async () => {
    const brain = await signedIn()
    remote.online = false
    const event = { ...newEvent(me, '2026-11-28', '19:00'), title: 'Board games' }
    await brain.saveEvent(event)
    // The upload tried at once failed: the event waits on this device.
    await vi.waitFor(() => expect(brain.status.state).toBe('offline'))
    remote.online = true
    let eventWasOnServer = false
    const row = invite(event.id)
    server.answers.invite_people = async () => {
      eventWasOnServer = remote.tables.events.has(event.id)
      await remote.upsert('event_invites', row)
      return [{ invite_id: row.id, name: 'Sam', email: null, phone: null, token: null }]
    }

    await brain.inviteToEvent(event, [{ name: 'Sam', user_id: 'friend' }])

    expect(eventWasOnServer).toBe(true)
    expect(await brain.db!.event_invites.get(row.id)).toMatchObject({ event_id: event.id, response: 'pending' })
  })

  it('cancelling my event shows it cancelled on this device', async () => {
    const brain = await signedIn()
    const event = { ...newEvent(me, '2026-11-28', '19:00'), title: 'Board games' }
    await brain.saveEvent(event)
    server.answers.cancel_event = async () => {
      await remote.upsert('events', { ...remote.tables.events.get(event.id)!, cancelled_at: '2026-11-24T12:00:00Z' })
      return []
    }

    await brain.cancelEvent(event.id)

    expect((await brain.db!.events.get(event.id))?.cancelled_at).toBe('2026-11-24T12:00:00Z')
  })

  it('leaving a bucket shared with me removes it from this device', async () => {
    const owner = 'someone-else'
    const bucket: VaultBucketRow = { id: crypto.randomUUID(), user_id: owner, name: 'Films to watch', position: 0, deleted_at: null }
    const share: VaultShareRow = { id: crypto.randomUUID(), user_id: owner, bucket_id: bucket.id, member: me, deleted_at: null }
    await remote.upsert('vault_buckets', bucket)
    await remote.upsert('vault_shares', share)
    const brain = await signedIn()
    expect(await brain.db!.vault_buckets.get(bucket.id)).toBeTruthy()
    server.answers.leave_vault_bucket = () => remote.upsert('vault_shares', { ...share, deleted_at: '2026-11-24T12:00:00Z' })

    await brain.leaveBucket(bucket.id)

    expect(await brain.db!.vault_buckets.get(bucket.id)).toBeUndefined()
  })
})

describe('SPEC §7 Things only the server can do: offline, they are not tried', () => {
  it('refuses with the offline reason and never reaches the server', async () => {
    const brain = await signedIn()
    server.isOnline = false

    const err = await brain.inviteToEvent(newEvent(me, '2026-11-28', '19:00'), [{ name: 'Sam', user_id: 'friend' }]).catch((e: unknown) => e)

    expect(reasonOf(err)).toBe('offline')
    expect(server.calls).toEqual([])
  })
})
