// Writing my Offsite connections, the people I saved by email or phone (SPEC §5 Calendar, Contacts).
import type { PersonRow } from '@/sync/types'
import { removeWithUndo, type ActionContext } from '@/sync/actions'
import { contactKey } from '@/events/contacts'
import { peopleToSave } from '@/events/people'
import type { PersonToInvite } from '@/events/sharing'
import { live } from '@/sync/live'

export function peopleActions({ ready }: ActionContext) {
  /**
   * Save someone from the Contacts editor. Someone else already saved with the same email or phone isn't saved twice:
   * that person comes back as `twin`, for the editor to say so.
   */
  async function savePerson(row: PersonRow): Promise<{ saved: PersonRow } | { twin: PersonRow }> {
    const { engine: e, uid, local } = ready()
    const person = { ...row, user_id: uid, name: row.name?.trim() || null, email: row.email?.trim().toLowerCase() || null, phone: row.phone?.trim() || null }
    const key = contactKey(person)
    const twin = live(await local.people.toArray()).find((p) => p.id !== person.id && contactKey(p) === key)
    if (twin) return { twin }
    return { saved: await e.save('people', person) }
  }

  /** Saving an event saves everyone I typed to my people, matching who's already saved (a new name replaces the old). */
  async function savePeople(typed: PersonToInvite[]) {
    const { engine: e, uid, local } = ready()
    const { add, rename } = peopleToSave(live(await local.people.toArray()), typed)
    for (const r of rename) await e.patch('people', r.id, () => ({ name: r.name }))
    for (const p of add) await e.save('people', { id: crypto.randomUUID(), user_id: uid, name: p.name ?? null, email: p.email ?? null, phone: p.phone ?? null, deleted_at: null })
  }

  /** Remove someone. Returns their Undo (SPEC §2). */
  const removePerson = (id: string) => removeWithUndo(ready, 'people', [id])

  return { savePerson, savePeople, removePerson }
}
