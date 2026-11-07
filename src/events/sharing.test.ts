import { describe, expect, it } from 'vitest'
import { busyTimes, hasConflict, suggestTimes, type FreeBusyRow } from './availability'
import { icsFile } from './ics'
import { inviteLink, inviteMessage, shareHref, whenText } from './sharing'
import { zonedTime } from '@/habits/rules'

const TZ = 'America/New_York'
const row = (extra: Partial<FreeBusyRow>): FreeBusyRow => ({
  user_id: 'bob',
  timezone: TZ,
  kind: 'rule',
  weekday: null,
  start_date: null,
  start_time: null,
  end_date: null,
  end_time: null,
  repeat: null,
  busy: true,
  ...extra,
})
const at = (date: string, time: string) => zonedTime(date, time, TZ)

describe('Spec §5 Availability: free and busy', () => {
  it('weekly unavailable times, exceptions and timed events make someone busy', () => {
    const busy = busyTimes(
      [
        row({ kind: 'rule', weekday: 2, start_time: '09:00:00', end_time: '17:00:00' }), // Tuesdays 9-5
        row({ kind: 'exception', start_date: '2026-11-12', busy: true }), // away all day Thursday
        row({ kind: 'event', start_date: '2026-11-11', start_time: '18:00:00', end_date: '2026-11-11', end_time: '19:00:00', repeat: 'never' }),
        row({ kind: 'event', start_date: '2026-11-11', start_time: null, end_date: '2026-11-11', end_time: null, repeat: 'never' }), // all day: doesn't block
      ],
      '2026-11-10',
      '2026-11-12',
    ).get('bob')!
    expect(hasConflict(busy, { start: at('2026-11-10', '10:00'), end: at('2026-11-10', '11:00') })).toBe(true)
    expect(hasConflict(busy, { start: at('2026-11-10', '17:00'), end: at('2026-11-10', '18:00') })).toBe(false)
    expect(hasConflict(busy, { start: at('2026-11-11', '18:30'), end: at('2026-11-11', '20:00') })).toBe(true)
    expect(hasConflict(busy, { start: at('2026-11-11', '12:00'), end: at('2026-11-11', '13:00') })).toBe(false)
    expect(hasConflict(busy, { start: at('2026-11-12', '12:00'), end: at('2026-11-12', '13:00') })).toBe(true)
  })

  it('an "available" exception frees up time that is normally unavailable', () => {
    const busy = busyTimes(
      [
        row({ kind: 'rule', weekday: 2, start_time: '09:00:00', end_time: '17:00:00' }),
        row({ kind: 'exception', start_date: '2026-11-10', start_time: '12:00:00', end_time: '14:00:00', busy: false }),
      ],
      '2026-11-10',
      '2026-11-10',
    ).get('bob')!
    expect(hasConflict(busy, { start: at('2026-11-10', '12:30'), end: at('2026-11-10', '13:30') })).toBe(false)
    expect(hasConflict(busy, { start: at('2026-11-10', '10:00'), end: at('2026-11-10', '11:00') })).toBe(true)
  })

  it('suggests up to 3 times when everyone is free, 8 am to 9 pm, not in the past', () => {
    const busy = busyTimes([row({ kind: 'rule', weekday: 2, start_time: '08:00:00', end_time: '20:00:00' })], '2026-11-10', '2026-11-24')
    const now = new Date(at('2026-11-10', '07:00'))
    const slots = suggestTimes(busy, 60 * 60_000, now, TZ)
    expect(slots.map((s) => new Date(s.start).toISOString())).toEqual([
      new Date(at('2026-11-10', '20:00')).toISOString(), // after Bob's Tuesday hours, before 9 pm
      new Date(at('2026-11-11', '08:00')).toISOString(),
      new Date(at('2026-11-11', '09:00')).toISOString(),
    ])
  })
})

describe('Spec §5 Shared events: calendar files', () => {
  it('a timed event, in UTC, with its repeat', () => {
    const ics = icsFile(
      { uid: 'abc', title: 'Party, with cake', notes: 'Bring games', start_date: '2026-11-20', start_time: '19:00:00', end_date: '2026-11-20', end_time: '22:00:00', repeat: 'weekly', timezone: TZ },
      new Date('2026-11-07T12:00:00Z'),
    )
    expect(ics).toContain('DTSTART:20261121T000000Z')
    expect(ics).toContain('DTEND:20261121T030000Z')
    expect(ics).toContain('SUMMARY:Party\\, with cake')
    expect(ics).toContain('RRULE:FREQ=WEEKLY')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })
  it('an all-day event ends the day after', () => {
    const ics = icsFile({ uid: 'x', title: 'Trip', start_date: '2026-11-20', start_time: null, end_date: '2026-11-22', end_time: null, repeat: 'never', timezone: TZ })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120')
    expect(ics).toContain('DTEND;VALUE=DATE:20261123')
  })
})

describe('Spec §5 Shared events: reaching guests one at a time', () => {
  it('a guest gets a private link and a message from me with it', () => {
    const link = inviteLink('inv1', 'tok', 'https://myadhdbrain.netlify.app')
    expect(link).toBe('https://myadhdbrain.netlify.app/rsvp/inv1/tok')
    const m = inviteMessage('Jordan', 'Carol', { title: 'Party', start_date: '2026-11-20', start_time: '19:00:00' }, link)
    expect(m.subject).toBe('Jordan invited you to Party')
    expect(m.body).toBe('Hi Carol! Jordan invited you to Party on Friday, November 20 at 7:00 pm. Can you make it? Answer here: https://myadhdbrain.netlify.app/rsvp/inv1/tok')
  })
  it('opens the messaging app for a phone number, or the email app for an email', () => {
    expect(shareHref({ phone: '(555) 010-3000', email: null, subject: 's', body: 'Hi & bye' })).toBe('sms:5550103000?body=Hi%20%26%20bye')
    expect(shareHref({ phone: null, email: 'c@x.com', subject: 'Hi', body: 'Yo' })).toBe('mailto:c%40x.com?subject=Hi&body=Yo')
  })
  it('says when an event is in words', () => {
    expect(whenText({ start_date: '2026-11-20', start_time: null })).toBe('Friday, November 20')
    expect(whenText({ start_date: '2026-11-20', start_time: '09:05:00' })).toBe('Friday, November 20 at 9:05 am')
  })
})
