import { describe, expect, it } from 'vitest'
import { icsFile } from '@/events/ics'
import { inviteLink, inviteMessage, shareHref, whenText } from '@/events/sharing'

const TZ = 'America/New_York'

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
    expect(shareHref({ phone: '(555) 010-3000', email: null, subject: 's', body: 'Hi & bye' }, false)).toBe('sms:5550103000?body=Hi%20%26%20bye')
    // iPhones need sms:NUMBER&body= to fill in the text (SPEC §10 Phase 3).
    expect(shareHref({ phone: '(555) 010-3000', email: null, subject: 's', body: 'Hi & bye' }, true)).toBe('sms:5550103000&body=Hi%20%26%20bye')
    expect(shareHref({ phone: null, email: 'c@x.com', subject: 'Hi', body: 'Yo' })).toBe('mailto:c%40x.com?subject=Hi&body=Yo')
  })
  it('says when an event is in words', () => {
    expect(whenText({ start_date: '2026-11-20', start_time: null })).toBe('Friday, November 20')
    expect(whenText({ start_date: '2026-11-20', start_time: '09:05:00' })).toBe('Friday, November 20 at 9:05 am')
  })
})
