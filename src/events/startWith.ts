// SPEC §5 Profiles, Invite to event: "New event" on a connection's profile opens the Calendar's new-event editor with
// them already added. The person is handed over in memory (never in the address), and taken once.
import type { PersonToInvite } from '@/events/sharing'

let waiting: PersonToInvite | null = null

export function startEventWith(person: PersonToInvite) {
  waiting = person
}

export function takeStartWith(): PersonToInvite | null {
  const person = waiting
  waiting = null
  return person
}
