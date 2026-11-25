import { describe, expect, it } from 'vitest'
import { fillMessage, whenText } from '@/events/guestMessages'
import serverChecks from '../../db/guest_messages.sql?raw'

const CANCEL = "Hi {{name}}, I'm sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!"
const party = { title: 'Party', start_date: '2026-11-20' }
const picnic = { title: 'Picnic', start_date: '2026-11-07', start_time: null }

// What the server's fill_message gives for each case: the same strings are checked against the server in
// src/tests/db/guest_messages.sql. Written out, not taken from messages.ts, because they are the server's words.
const serverCopies = [
  { template: CANCEL, name: 'Carol', event: { ...party, start_time: '19:00:00' }, copy: "Hi Carol, I'm sorry, but I have to cancel Party on Friday, November 20 at 7:00 pm. Sorry for the short notice!" },
  { template: CANCEL, name: '   ', event: { ...party, start_time: '00:30:00' }, copy: "Hi there, I'm sorry, but I have to cancel Party on Friday, November 20 at 12:30 am. Sorry for the short notice!" },
  { template: CANCEL, name: null, event: { ...party, start_time: null }, copy: "Hi there, I'm sorry, but I have to cancel Party on Friday, November 20. Sorry for the short notice!" },
  { template: '{{event}}: {{date}}, {{time}}', name: 'Dan', event: picnic, copy: 'Picnic: Saturday, November 7, all day' },
]

describe('SPEC §5 Cancelling: the preview reads like the copy each person gets', () => {
  it.each(serverCopies)('$copy', ({ template, name, event, copy }) => {
    expect(fillMessage(template, name, event)).toBe(copy)
  })

  it('every case is also checked against the server', () => {
    for (const { copy } of serverCopies) expect(serverChecks).toContain(`'${copy.replaceAll("'", "''")}'`)
  })
})

describe('SPEC §5 Shared events: what guests are sent', () => {
  it('says when an event is in words', () => {
    expect(whenText({ start_date: '2026-11-20', start_time: null })).toBe('Friday, November 20')
    expect(whenText({ start_date: '2026-11-20', start_time: '09:05:00' })).toBe('Friday, November 20 at 9:05 am')
  })
})
