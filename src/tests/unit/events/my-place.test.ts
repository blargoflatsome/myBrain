import { describe, expect, it } from 'vitest'
import { myPlace, newEvent, shownToMe, stillCounts } from '@/events/rules'
import type { EventInviteRow, InviteResponse } from '@/sync/types'

const ME = '11111111-2222-4333-8444-555555555555'
const HOST = '99999999-2222-4333-8444-555555555555'
const theirs = newEvent(HOST, '2026-11-20', '19:00', 'e1')
const invite = (response: InviteResponse, deleted_at: string | null = null): EventInviteRow => ({ id: 'i1', event_id: 'e1', response, deleted_at })

describe('SPEC §5 Shared events: my place in an event', () => {
  it.each([
    ['my own event', newEvent(ME, '2026-11-20', null, 'e1'), [], ME, 'mine', true],
    ['an event with no owner yet', { ...theirs, user_id: '' }, [], ME, 'mine', true],
    ['signed out', theirs, [], null, 'mine', true],
    ['invited, not answered', theirs, [invite('pending')], ME, 'pending', true],
    ['Maybe', theirs, [invite('maybe')], ME, 'maybe', true],
    ['Yes', theirs, [invite('yes')], ME, 'yes', true],
    ['No', theirs, [invite('no')], ME, 'no', false],
    ['dropped out', theirs, [invite('dropped')], ME, 'dropped', false],
    ['no invite', theirs, [], ME, null, false],
    ['the invite was removed', theirs, [invite('yes', '2026-11-19')], ME, null, false],
  ] as const)('%s', (_, event, invites, me, place, shown) => {
    expect(myPlace(event, invites, me)).toBe(place)
    expect(shownToMe(event, invites, me)).toBe(shown)
  })

  it('a deleted event is not shown, even my own', () => {
    expect(shownToMe({ ...newEvent(ME, '2026-11-20', null, 'e1'), deleted_at: '2026-11-19' }, [], ME)).toBe(false)
  })

  it.each([
    ['pending', true],
    ['maybe', true],
    ['yes', true],
    ['no', false],
    ['dropped', false],
  ] as const)('an invitee who answered %s still counts for change and cancel notices: %s', (response, counts) => {
    expect(stillCounts(response)).toBe(counts)
  })
})
