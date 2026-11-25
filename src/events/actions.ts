// SPEC §5 Calendar, Shared events, Cancelling: saving my events, inviting people to them, and the server calls that
// change my events and invitations. Each server call brings my copy up to date before it returns, so screens never
// refresh anything themselves (SPEC §7).
import { removeWithUndo, type ActionContext } from '@/sync/actions'
import { live } from '@/sync/live'
import type { EventRow } from '@/sync/types'
import { inviteLink, type NewInvite, type PersonToInvite, type Recipient, type ShareTarget } from '@/events/sharing'
import { invitationTargets, recipientTargets } from '@/events/guestMessages'
import { stillCounts } from '@/events/rules'
import { reasonOf, ServerError, type ServerReason } from '@/server/server'
import { achieved } from '@/celebrate/bus'

/** What inviting people gives back: guests I message one at a time, and how many were invited in the app (SPEC §5). */
export interface Invited {
  toMessage: ShareTarget[]
  inApp: number
}

/** What saving an event gives back for the screen to show. */
export interface EventSaved extends Invited {
  /** The event as saved (title trimmed). */
  event: EventRow
  /** Its date or time changed and someone invited still counts: offer to let them know (SPEC §10 Connections). */
  offerChangeNotice: boolean
  /** Why no one was invited; the event and the people I typed are saved either way. */
  inviteFailed: ServerReason | null
}

export interface EventDeps {
  /** Saving an event saves everyone I typed to my people (SPEC §5 Calendar, Contacts). */
  savePeople: (people: PersonToInvite[]) => Promise<void>
  /** My name, as guests see it in their invitation. */
  hostName: () => Promise<string>
}

// Times come back from the server as 19:00:00 and from the editor as 19:00.
const when = (x: EventRow) => [x.start_date, x.start_time?.slice(0, 5), x.end_date, x.end_time?.slice(0, 5), x.repeat].join('|')

export function eventActions({ ready, onServer }: ActionContext, deps: EventDeps) {
  async function saveEvent(row: EventRow) {
    const { engine: e, uid } = ready()
    return e.save('events', { ...row, title: row.title.trim(), user_id: uid })
  }
  /** Delete an event of mine (one with guests is cancelled through the server instead). Returns its Undo (SPEC §2). */
  const deleteEvent = (id: string) => removeWithUndo(ready, 'events', [id])

  /** Invite people to my event (saved on this device first); returns who still needs a message from me. */
  async function invitePeople(event: string, people: PersonToInvite[]): Promise<NewInvite[]> {
    const invites = (await onServer<NewInvite[] | null>('invite_people', { event, people }, ['event_invites'])) ?? []
    if (invites.length) achieved({ kind: 'shared_event' })
    return invites
  }

  /**
   * Invite people to my event (SPEC §5 Shared events). App users get it in the app; guests with an email or phone come
   * back with their invitation, to message one at a time. Throws a ServerError when no one could be invited.
   */
  async function inviteToEvent(event: EventRow, people: PersonToInvite[]): Promise<Invited> {
    const created = await invitePeople(event.id, people)
    const toMessage = invitationTargets(await deps.hostName(), event, created, inviteLink)
    return { toMessage, inApp: created.length - toMessage.length }
  }

  /**
   * Save my event, everyone I typed to my people, then invite them (SPEC §5 Calendar, Shared events). The event is saved
   * on this device even offline; only inviting needs a connection, and why it failed comes back as `inviteFailed`.
   */
  async function saveEventWithPeople(row: EventRow, people: PersonToInvite[] = []): Promise<EventSaved> {
    const { local } = ready()
    const before = await local.events.get(row.id)
    const saved = await saveEvent(row)
    const changed = !!before && !before.deleted_at && when(before) !== when(saved)
    const invites = changed ? live(await local.event_invites.where('event_id').equals(row.id).toArray()) : []
    const result: EventSaved = { event: saved, toMessage: [], inApp: 0, offerChangeNotice: invites.some((i) => stillCounts(i.response)), inviteFailed: null }
    await deps.savePeople(people)
    if (!people.length) return result
    try {
      return { ...result, ...(await inviteToEvent(saved, people)) }
    } catch (err) {
      if (!(err instanceof ServerError)) console.error(err)
      return { ...result, inviteFailed: reasonOf(err) }
    }
  }

  /** Tell everyone who still counts that my event's date or time changed; returns the guests to message (SPEC §10). */
  async function tellEventChanged(event: EventRow): Promise<ShareTarget[]> {
    // My saved change goes up first, so the server writes the new date and time into the messages.
    const recipients = (await onServer<Recipient[] | null>('event_changed', { event: event.id }, ['event_invites'])) ?? []
    return recipientTargets(recipients, 'changed', event)
  }

  /** Cancel my event; returns the guests to message about it (app users are told in the app). */
  async function cancelEvent(event: EventRow): Promise<ShareTarget[]> {
    const recipients = (await onServer<Recipient[] | null>('cancel_event', { event: event.id }, ['events', 'event_invites'])) ?? []
    return recipientTargets(recipients, 'cancelled', event)
  }

  return {
    saveEvent,
    deleteEvent,
    saveEventWithPeople,
    inviteToEvent,
    tellEventChanged,
    cancelEvent,
    dropOut: (event: string) => onServer('drop_out', { event }, ['events', 'event_invites']),
    uninvite: (invite: string) => onServer('uninvite', { invite }, ['event_invites']),
    respondToInvite: (invite: string, answer: 'yes' | 'maybe' | 'no') => onServer('respond_to_invite', { invite, answer }, ['event_invites']),
    setInviteOptional: (invite: string, value: boolean) => onServer('set_invite_optional', { invite, value }, ['event_invites']),
    /** A guest's new answer link; the old one stops working (SPEC §10 Connections). */
    newInviteLink: (invite: string) => onServer<string>('new_invite_link', { invite }, ['event_invites']),
  }
}
