// SPEC §5 Shared events, Cancelling: the server calls that change my events and invitations. Each brings my copy of
// them up to date before it returns, so screens never refresh anything themselves (SPEC §7).
import type { ActionContext } from '@/sync/actions'
import type { NewInvite, PersonToInvite, Recipient } from '@/events/sharing'
import { achieved } from '@/celebrate/bus'

export function eventServerActions({ onServer }: ActionContext) {
  /** Invite people to my event (saved on this device first); returns who still needs a message from me. */
  async function invitePeople(event: string, people: PersonToInvite[]): Promise<NewInvite[]> {
    const invites = (await onServer<NewInvite[] | null>('invite_people', { event, people }, ['event_invites'])) ?? []
    if (invites.length) achieved({ kind: 'shared_event' })
    return invites
  }

  /** Cancel my event; returns everyone to message about it. */
  const cancelEvent = async (event: string): Promise<Recipient[]> => (await onServer<Recipient[] | null>('cancel_event', { event }, ['events', 'event_invites'])) ?? []

  return {
    invitePeople,
    cancelEvent,
    dropOut: (event: string) => onServer('drop_out', { event }, ['events', 'event_invites']),
    uninvite: (invite: string) => onServer('uninvite', { invite }, ['event_invites']),
    respondToInvite: (invite: string, answer: 'yes' | 'maybe' | 'no') => onServer('respond_to_invite', { invite, answer }, ['event_invites']),
    setInviteOptional: (invite: string, value: boolean) => onServer('set_invite_optional', { invite, value }, ['event_invites']),
    /** A guest's new answer link; the old one stops working (SPEC §10 Connections). */
    newInviteLink: (invite: string) => onServer<string>('new_invite_link', { invite }, ['event_invites']),
  }
}
