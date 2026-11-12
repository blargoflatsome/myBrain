// SPEC §5 Profiles: which of my events a connection can be invited to from their profile.
import { occurrences } from '@/events/rules'
import { addDays } from '@/tasks/days'
import type { BadgeRow, EventInviteRow, EventRow } from '@/sync/types'

/** The most people one event can have (SPEC §5 Shared events, the server's limit too). */
export const EVENT_PEOPLE_LIMIT = 25

export interface InviteChoice {
  event: EventRow
  /** The next day it happens (today or later). */
  next: string
  state: 'open' | 'invited' | 'full'
}

/**
 * My upcoming events (created by me, not cancelled or deleted, happening today or later), soonest first, each marked
 * Invited when they already are, or Full at the 25-person limit.
 */
export function inviteChoices(events: EventRow[], invites: EventInviteRow[], invitedEventIds: ReadonlySet<string>, me: string, today: string): InviteChoice[] {
  const people = new Map<string, number>()
  for (const i of invites) if (!i.deleted_at) people.set(i.event_id, (people.get(i.event_id) ?? 0) + 1)
  const choices: InviteChoice[] = []
  for (const event of events) {
    if (event.deleted_at || event.cancelled_at || event.user_id !== me) continue
    const next = occurrences(event, today, addDays(today, 366))[0]
    if (!next) continue
    const state = invitedEventIds.has(event.id) ? 'invited' : (people.get(event.id) ?? 0) >= EVENT_PEOPLE_LIMIT ? 'full' : 'open'
    choices.push({ event, next: next < today ? today : next, state })
  }
  return choices.sort((a, b) => a.next.localeCompare(b.next) || (a.event.start_time ?? '').localeCompare(b.event.start_time ?? ''))
}

/** What the server says about a connection (SPEC §5 Profiles). */
export interface ProfileBadge {
  kind: string
  earned_at: string
  levels?: string[] | null
}

/** Their badges as rows the trophy board reads (only kind, first earned and level days ever reach this device). */
export function badgeRows(badges: ProfileBadge[]): BadgeRow[] {
  return badges.map((b) => ({ id: b.kind, kind: b.kind, earned_at: b.earned_at, levels: b.levels ?? [], deleted_at: null }))
}
