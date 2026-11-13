// My people (SPEC §5 Calendar): guests I typed once, saved when the event is saved, then picked from a list.
import { contactKey } from '@/events/contacts'
import type { PersonToInvite } from '@/events/sharing'
import type { PersonRow } from '@/sync/types'

type Contact = { name?: string | null; email?: string | null; phone?: string | null }

/** How a person is shown: their name, else their email or phone number. */
export const personLabel = (p: Contact) => p.name || p.email || p.phone || ''
/** Everything a saved person's row shows (name, then email or phone), so a button's name includes all its visible words (WCAG 2.5.3). */
export const shownAs = (p: Contact) => (p.name ? `${p.name} · ${p.email || p.phone || ''}`.replace(/ · $/, '') : personLabel(p))

/** A to Z by how they're shown, ignoring case and accents. */
export function sortPeople<T extends Contact>(people: T[]): T[] {
  return [...people].sort((a, b) => personLabel(a).localeCompare(personLabel(b), undefined, { sensitivity: 'base' }))
}

/** Each person once (the same email in any case, or phone number in any formatting), keeping the latest change. */
export function uniquePeople(rows: PersonRow[]): PersonRow[] {
  const byKey = new Map<string, PersonRow>()
  for (const r of rows) {
    const key = contactKey(r)
    if (!key) continue
    const known = byKey.get(key)
    if (!known || (r.updated_at ?? '') > (known.updated_at ?? '')) byKey.set(key, r)
  }
  return [...byKey.values()]
}

/** Whether a person matches what I typed: name or email (any case), or 3+ digits of their phone number. */
export function matchesPerson(p: Contact, typed: string): boolean {
  const words = typed.trim().toLowerCase()
  if (!words) return true
  const digits = words.replace(/\D/g, '')
  return (
    (p.name ?? '').toLowerCase().includes(words) ||
    (p.email ?? '').toLowerCase().includes(words) ||
    (digits.length >= 3 && (p.phone ?? '').replace(/\D/g, '').includes(digits))
  )
}

/**
 * What saving an event does to my people: everyone I typed (by email or phone) who isn't saved yet is added, and a
 * saved person I typed a new name for gets that name. People found by name (app users) aren't saved here.
 */
export function peopleToSave(saved: PersonRow[], typed: PersonToInvite[]): { add: Contact[]; rename: { id: string; name: string }[] } {
  const byKey = new Map(uniquePeople(saved).map((p) => [contactKey(p)!, p]))
  const add: Contact[] = []
  const rename: { id: string; name: string }[] = []
  for (const t of typed) {
    if (t.user_id) continue
    const key = contactKey(t)
    if (!key) continue
    const name = t.name?.trim() || null
    const known = byKey.get(key)
    if (known) {
      if (name && name !== known.name && !rename.some((r) => r.id === known.id)) rename.push({ id: known.id, name })
      continue
    }
    const person = { name, email: t.email ?? null, phone: t.email ? null : (t.phone ?? null) }
    add.push(person)
    byKey.set(key, { id: '', deleted_at: null, ...person })
  }
  return { add, rename }
}
