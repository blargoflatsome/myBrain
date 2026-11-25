import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { newEvent } from '@/events/rules'
import type { EventInviteRow, EventRow, InviteResponse } from '@/sync/types'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { FakeServer } from '@/tests/support/fakeServer'

let remote: FakeRemote
let server: FakeServer
let restore: () => void
const me = `u-${crypto.randomUUID()}`

beforeEach(() => {
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

const party = (): EventRow => ({ ...newEvent(me, '2026-11-28', '19:00'), title: 'Board games' })
const invite = (event: EventRow, response: InviteResponse): EventInviteRow => ({ id: crypto.randomUUID(), user_id: me, event_id: event.id, name: 'Sam', response, deleted_at: null })

/** Signed in with my event (as the server sends times, 19:00:00) and its invitations already downloaded. */
async function signedInWith(event: EventRow, invites: EventInviteRow[]) {
  await remote.upsert('events', { ...event, start_time: '19:00:00', end_time: '20:00:00' })
  for (const i of invites) await remote.upsert('event_invites', i)
  const brain = useBrainStore()
  brain.start(me, remote)
  await vi.waitFor(() => expect(brain.syncedCount).toBeGreaterThan(0))
  return brain
}

describe('SPEC §10 Connections: changing the date or time offers to let invitees know', () => {
  it.each([
    ['only the title changed, with someone going', { title: 'Board game night' }, ['yes'], false],
    ['the time changed, with someone going', { start_time: '18:00' }, ['yes'], true],
    ['the date changed, with someone not answered yet', { start_date: '2026-11-29', end_date: '2026-11-29' }, ['pending'], true],
    ['the time changed, but everyone said No or dropped out', { start_time: '18:00' }, ['no', 'dropped'], false],
  ] as const)('%s', async (_, change, answers, offered) => {
    const event = party()
    const brain = await signedInWith(event, answers.map((a) => invite(event, a)))

    const saved = await brain.saveEventWithPeople({ ...event, ...change })

    expect(saved.offerChangeNotice).toBe(offered)
    expect(saved.event).toMatchObject(change)
  })

  it('letting them know uploads my change first, so the server writes the new time into the messages', async () => {
    const event = party()
    const brain = await signedInWith(event, [invite(event, 'yes')])
    remote.online = false
    const saved = await brain.saveEventWithPeople({ ...event, title: '  Board games ', start_time: '18:00', end_time: '19:00' })
    // The notice is about the event as saved (code review: it once used the title as typed).
    expect(saved.event.title).toBe('Board games')
    // The upload tried at once failed: the change waits on this device.
    await vi.waitFor(() => expect(brain.status.state).toBe('offline'))
    remote.online = true
    let timeOnServer: string | null | undefined
    server.answers.event_changed = () => {
      timeOnServer = remote.tables.events.get(event.id)?.start_time
      return [{ invite_id: 'i1', name: 'Carol', email: 'carol@example.com', phone: null, body: 'Moved to 6 pm' }]
    }

    const targets = await brain.tellEventChanged(saved.event)

    expect(timeOnServer).toBe('18:00')
    expect(targets).toMatchObject([{ inviteId: 'i1', email: 'carol@example.com', body: 'Moved to 6 pm' }])
  })
})

describe('SPEC §5 Shared events: saving an event invites the people I typed', () => {
  it('guests with an email or phone come back to message one at a time; app users are invited in the app', async () => {
    const event = party()
    const brain = await signedInWith(event, [])
    server.answers.invite_people = [
      { invite_id: 'guest', name: 'Carol', email: 'carol@example.com', phone: null, token: 'tok' },
      { invite_id: 'friend', name: 'Bob', email: null, phone: null, token: null },
    ]

    const saved = await brain.saveEventWithPeople(event, [{ name: 'Carol', email: 'carol@example.com' }, { user_id: 'bob', name: 'Bob' }])

    expect(saved).toMatchObject({ inApp: 1, inviteFailed: null, toMessage: [{ inviteId: 'guest', name: 'Carol', email: 'carol@example.com' }] })
    expect(saved.toMessage[0]!.body).toContain('/rsvp/guest/tok')
  })

  it('offline, the event and the people I typed are saved, and no one is invited', async () => {
    const event = party()
    const brain = await signedInWith(event, [])
    server.isOnline = false

    const saved = await brain.saveEventWithPeople({ ...event, title: 'Board game night' }, [{ name: 'Carol', email: 'carol@example.com' }])

    expect(saved.inviteFailed).toBe('offline')
    expect(server.calls).toEqual([])
    expect(await brain.db!.events.get(event.id)).toMatchObject({ title: 'Board game night' })
    expect(await brain.db!.people.toArray()).toMatchObject([{ name: 'Carol', email: 'carol@example.com' }])
  })
})
