// Writing my availability: weekly times and one-off days (SPEC §5 Calendar, Find a time).
import type { AvailabilityExceptionRow } from '@/sync/types'
import { removeWithUndo, type ActionContext } from '@/sync/actions'

/** A time range ends after it starts ('HH:MM'). */
export const validRange = (from: string, until: string) => until > from

export function availabilityActions({ ready }: ActionContext) {
  /** Add the same times on each weekday given (0 Sunday … 6 Saturday). Returns false when the times don't make a range. */
  async function addAvailability(weekdays: number[], from: string, until: string) {
    if (!validRange(from, until)) return false
    const { engine: e, uid } = ready()
    for (const weekday of [...weekdays].sort((a, b) => a - b)) {
      await e.save('availability_rules', { id: crypto.randomUUID(), user_id: uid, weekday, start_time: from, end_time: until, deleted_at: null })
    }
    return true
  }

  /** Add a one-off day, all day (no times) or for a time range. Returns false when the times don't make a range. */
  async function addAvailabilityDay(day: Pick<AvailabilityExceptionRow, 'date' | 'kind' | 'note'> & { from?: string | null; until?: string | null }) {
    const timed = !!day.from && !!day.until
    if (timed && !validRange(day.from!, day.until!)) return false
    const { engine: e, uid } = ready()
    await e.save('availability_exceptions', {
      id: crypto.randomUUID(),
      user_id: uid,
      date: day.date,
      start_time: timed ? day.from! : null,
      end_time: timed ? day.until! : null,
      kind: day.kind,
      note: day.note?.trim() || null,
      deleted_at: null,
    })
    return true
  }

  /** Remove a weekly time or a one-off day. Returns its Undo (SPEC §2). */
  const removeAvailability = (table: 'availability_rules' | 'availability_exceptions', id: string) => removeWithUndo(ready, table, [id])

  return { addAvailability, addAvailabilityDay, removeAvailability }
}
