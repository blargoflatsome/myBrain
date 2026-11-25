// What the priority reminder's slide, snooze and cancel write (SPEC §5 High-priority tasks and priority habits).
import type { HabitRow, ReminderStateRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { getRow } from '@/sync/db'
import { cancelState, snoozeState, type DuePriority } from '@/reminders/priority'

type NextState = (item: DuePriority, existing: ReminderStateRow | undefined, uid: string, now: Date) => ReminderStateRow

export function priorityActions(
  { ready }: ActionContext,
  completeHabit: (habit: HabitRow, now: Date) => Promise<unknown>,
  completeTask: (id: string, now: Date) => Promise<unknown>,
) {
  /** Slide to complete: a priority habit is completed for the day; a High task is crossed off. Never undoes either. */
  async function completePriority(item: DuePriority, now = new Date()) {
    const { local } = ready()
    if (item.kind === 'habit') {
      const habit = await getRow(local, 'habits', item.id)
      if (habit) await completeHabit(habit, now)
      return
    }
    await completeTask(item.id, now)
  }

  /** Save today's reminder state for an item, worked out from what it was. */
  async function setState(item: DuePriority, next: NextState, now: Date) {
    const { engine: e, uid, local } = ready()
    const existing = (await local.reminder_state.where('item_id').equals(item.id).toArray()).find((s) => s.date === item.date && !s.deleted_at)
    await e.save('reminder_state', next(item, existing, uid, now))
  }

  const snoozePriority = (item: DuePriority, now = new Date()) => setState(item, snoozeState, now)
  const cancelPriority = (item: DuePriority, now = new Date()) => setState(item, cancelState, now)

  return { completePriority, snoozePriority, cancelPriority }
}
