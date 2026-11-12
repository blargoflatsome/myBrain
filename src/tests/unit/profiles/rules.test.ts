import { describe, expect, it } from 'vitest'
import { EVENT_PEOPLE_LIMIT, inviteChoices } from '@/profiles/rules'
import type { EventInviteRow, EventRow } from '@/sync/types'

const ME = 'me'
const TODAY = '2026-11-12'
const event = (id: string, over: Partial<EventRow> = {}): EventRow => ({
  id, user_id: ME, title: id, start_date: '2026-11-20', start_time: '19:00', end_date: '2026-11-20', end_time: '21:00',
  repeat: 'never', reminder_minutes: null, cancelled_at: null, deleted_at: null, ...over,
})
const invite = (eventId: string, n: number): EventInviteRow => ({ id: `${eventId}-${n}`, event_id: eventId, response: 'pending', deleted_at: null })

describe('SPEC §5 Profiles: Invite to event lists my upcoming events', () => {
  it('only my own events that are still to come and not cancelled, soonest first, marked Invited or Full', () => {
    const events = [
      event('later', { start_date: '2026-12-01', end_date: '2026-12-01' }),
      event('soon'),
      event('past', { start_date: '2026-11-01', end_date: '2026-11-01' }),
      event('cancelled', { cancelled_at: '2026-11-10T00:00:00Z' }),
      event('deleted', { deleted_at: '2026-11-10T00:00:00Z' }),
      event('theirs', { user_id: 'someone' }),
      // A weekly event that started on a Thursday in October comes next on Thursday the 12th (today).
      event('weekly', { start_date: '2026-10-01', end_date: '2026-10-01', repeat: 'weekly' }),
      event('invited', { start_date: '2026-11-25', end_date: '2026-11-25' }),
      event('full', { start_date: '2026-11-26', end_date: '2026-11-26' }),
    ]
    const invites = Array.from({ length: EVENT_PEOPLE_LIMIT }, (_, n) => invite('full', n))
    const choices = inviteChoices(events, invites, new Set(['invited']), ME, TODAY)
    expect(choices.map((c) => [c.event.id, c.next, c.state])).toEqual([
      ['weekly', '2026-11-12', 'open'],
      ['soon', '2026-11-20', 'open'],
      ['invited', '2026-11-25', 'invited'],
      ['full', '2026-11-26', 'full'],
      ['later', '2026-12-01', 'open'],
    ])
  })
})
