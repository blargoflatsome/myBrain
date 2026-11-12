// Shared events (SPEC §5 Shared events, Cancelling): calls to the server functions, answer links, and the
// one-at-a-time sharing flow (messaging app or email app) until automatic texts and emails exist.
import type { FreeBusyRow } from '@/events/availability'
import { formatTime } from '@/time/parse'
import { supabase } from '@/lib/supabase'
import { isIOS } from '@/ui/device'
import type { EventRow, InviteResponse } from '@/sync/types'
import { achieved } from '@/celebrate/bus'

export interface PersonToInvite {
  /** Found by name search. */
  user_id?: string
  name?: string
  email?: string
  phone?: string
}
export interface NewInvite {
  invite_id: string
  name: string | null
  email: string | null
  phone: string | null
  token: string | null
}
/** Someone to reach one at a time, with the message to send them. */
export interface ShareTarget {
  inviteId: string
  name: string | null
  email: string | null
  phone: string | null
  subject: string
  body: string
}
export interface EventPerson {
  invite_id: string
  name: string | null
  email: string | null
  phone: string | null
  response: InviteResponse
  is_me: boolean
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
async function list<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  return (await call<T[] | null>(fn, args)) ?? []
}

export async function invitePeople(event: string, people: PersonToInvite[]) {
  const invites = await list<NewInvite>('invite_people', { event, people })
  if (invites.length) achieved({ kind: 'shared_event' })
  return invites
}
export const uninvite = (invite: string) => call<void>('uninvite', { invite })
export const respondToInvite = (invite: string, answer: 'yes' | 'maybe' | 'no') => call<void>('respond_to_invite', { invite, answer })
export const eventPeople = (event: string) => list<EventPerson>('event_people', { event })
/** Connections' free or busy times (SPEC §10 Connections: scheduling). */
export const freeBusy = (people: string[]) => list<FreeBusyRow>('free_busy', { people })
export interface Recipient {
  invite_id: string
  name: string | null
  email: string | null
  phone: string | null
  body: string
}
export const messageEvent = (event: string, audience: 'host' | 'everyone', message: string) => list<Recipient>('message_event', { event, audience, message })
export const cancelEvent = (event: string) => list<Recipient>('cancel_event', { event })
export const dropOut = (event: string) => call<void>('drop_out', { event })
export const markShared = (invites: string[], kind: 'invite' | 'message' | 'cancel' | 'update') => call<void>('mark_shared', { invites, msg_kind: kind })

export interface GuestInvite {
  host_name: string | null
  guest_name: string | null
  title: string
  notes: string | null
  start_date: string
  start_time: string | null
  end_date: string
  end_time: string | null
  repeat: EventRow['repeat']
  timezone: string
  response: InviteResponse
  cancelled: boolean
  /** The event ended over 30 days ago (or a year after the last answer, for a repeating event): read-only. */
  passed?: boolean
}
export async function guestInvite(invite: string, token: string): Promise<GuestInvite | null> {
  const rows = await list<GuestInvite>('guest_invite', { invite, token })
  return rows[0] ?? null
}
export const guestRespond = (invite: string, token: string, answer: 'yes' | 'maybe' | 'no') => call<void>('guest_respond', { invite, token, answer })
export const guestMessage = (invite: string, token: string, message: string) => call<void>('guest_message', { invite, token, message })
export const guestOptOut = (invite: string, token: string) => call<void>('guest_opt_out', { invite, token })

/** A guest's private answer link. */
export function inviteLink(inviteId: string, token: string, origin: string = window.location.origin): string {
  return `${origin}/rsvp/${inviteId}/${token}`
}

/** When an event is, in words, e.g. "Friday, November 20 at 7:00 pm". */
export function whenText(e: Pick<EventRow, 'start_date' | 'start_time'>): string {
  const [y, m, d] = e.start_date.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  if (!e.start_time) return date
  return `${date} at ${formatTime(e.start_time, true)}`
}

/** The invitation I send a guest myself (written from me to them, not in the "past you" voice). */
export function inviteMessage(host: string, guest: string | null, e: Pick<EventRow, 'title' | 'start_date' | 'start_time'>, link: string): { subject: string; body: string } {
  return {
    subject: `${host} invited you to ${e.title}`,
    body: `Hi ${guest?.trim() || 'there'}! ${host} invited you to ${e.title} on ${whenText(e)}. Can you make it? Answer here: ${link}`,
  }
}

/** Open my messaging app (texts) or email app with one person's message ready. */
export function shareHref(t: Pick<ShareTarget, 'email' | 'phone' | 'subject' | 'body'>, ios: boolean = isIOS()): string | null {
  // iPhones only fill in the text when the link is written sms:NUMBER&body= (SPEC §10 Phase 3).
  if (t.phone) return `sms:${t.phone.replace(/[^\d+]/g, '')}${ios ? '&' : '?'}body=${encodeURIComponent(t.body)}`
  if (t.email) return `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`
  return null
}
