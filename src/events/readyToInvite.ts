// People brought in by sharing a contact (SPEC §5 Calendar, "Sharing a contact"), waiting for the event I choose.
// Kept in memory only: the invite screen hands them to the calendar, which puts them under "To invite".
import type { PersonToInvite } from '@/events/sharing'

let ready: PersonToInvite[] = []

export function setReadyToInvite(people: PersonToInvite[]) {
  ready = [...people]
}

/** The people waiting to be invited, once (taking them clears the list). */
export function takeReadyToInvite(): PersonToInvite[] {
  const people = ready
  ready = []
  return people
}
