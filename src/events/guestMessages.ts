// SPEC §5 Shared events, Cancelling: everything I send guests one at a time from my own apps. The subject lines, who
// each message goes to (a share target), and the preview of my cancellation message, filled in the same way the
// server's fill_message fills each person's copy (pinned by src/tests/unit/events/guest-messages.test.ts).
import { messages } from '@/messages'
import { formatTime } from '@/time/parse'
import type { EventRow } from '@/sync/types'
import type { NewInvite, Recipient, ShareTarget } from '@/events/sharing'

const g = messages.guestMessages

// The server's own words in fill_message and event_when (migrations shared_events and all_day_message_wording), so
// the preview reads exactly like the copy each person gets. Changing them means a migration too.
const NO_NAME = 'there'
const ALL_DAY = 'all day'

type When = Pick<EventRow, 'start_date' | 'start_time'>

/** The date and time of an event in words, as the server writes them: "Friday, November 20" and "7:00 pm" (or null). */
export function whenParts(e: When): { date: string; time: string | null } {
  const [y, m, d] = e.start_date.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return { date, time: e.start_time ? formatTime(e.start_time, true) : null }
}

/** When an event is, in words, e.g. "Friday, November 20 at 7:00 pm". */
export function whenText(e: When): string {
  const { date, time } = whenParts(e)
  return time ? g.when(date, time) : date
}

/**
 * One person's copy of my message: {{name}}, {{event}}, {{date}} and {{time}} filled in, in the server's order. An
 * all-day event drops " at {{time}}", so it reads "on Saturday, November 7", not "at all day".
 */
export function fillMessage(template: string, recipient: string | null | undefined, e: When & Pick<EventRow, 'title'>): string {
  const { date, time } = whenParts(e)
  const text = e.start_time ? template : template.replaceAll(' at {{time}}', '')
  return text
    .replaceAll('{{name}}', recipient?.trim() || NO_NAME)
    .replaceAll('{{event}}', e.title)
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time ?? ALL_DAY)
}

/** The invitation I send a guest myself. */
export function invitation(host: string, guest: string | null, e: When & Pick<EventRow, 'title'>, link: string): { subject: string; body: string } {
  return { subject: g.invitedSubject(host, e.title), body: g.invitedBody(host, guest?.trim() || NO_NAME, e.title, whenText(e), link) }
}

/** Guests I just invited who have an email or phone and a link, each with their invitation. */
export function invitationTargets(host: string, e: When & Pick<EventRow, 'title'>, invites: NewInvite[], link: (invite: string, token: string) => string): ShareTarget[] {
  return invites
    .filter((i) => i.token && (i.email || i.phone))
    .map((i) => ({ ...reach(i), ...invitation(host, i.name, e, link(i.invite_id, i.token!)) }))
}

/** The guests the server wrote a message for, each with its subject (it leaves out anyone told in the app). */
export function recipientTargets(recipients: Recipient[], subject: 'changed' | 'cancelled', e: Pick<EventRow, 'title'>): ShareTarget[] {
  const line = subject === 'changed' ? g.changedSubject(e.title) : g.cancelledSubject(e.title)
  return recipients.map((r) => ({ ...reach(r), subject: line, body: r.body }))
}

/** A guest's new answer link, to send them (SPEC §10 Connections: forwarded guest links). */
export function newLinkMessage(link: string): { subject: string; body: string } {
  return { subject: g.newLinkSubject, body: g.newLinkBody(link) }
}

const reach = (r: { invite_id: string; name: string | null; email: string | null; phone: string | null }) => ({ inviteId: r.invite_id, name: r.name, email: r.email, phone: r.phone })
