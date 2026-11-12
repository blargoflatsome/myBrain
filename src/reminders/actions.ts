// What the priority reminder's slide, snooze and cancel write (SPEC §5 Priority tasks and priority habits).
import type { HabitRow, ReminderStateRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { cancelState, snoozeState, type DuePriority } from '@/reminders/priority'
import { logIdFor } from '@/sync/ids'

type NextState = (item: DuePriority, existing: ReminderStateRow | undefined, uid: string, now: Date) => ReminderStateRow

export function priorityActions({ ready }: ActionContext, toggleHabit: (habit: HabitRow, now: Date) => Promise<unknown>) {
  /** Slide to complete: a priority habit is completed for the day; a priority task gets today's completion. */
  async function completePriority(item: DuePriority, now = new Date()) {
    const { engine: e, uid, local } = ready()
    if (item.kind === 'habit') {
      const habit = await local.habits.get(item.id)
      if (habit) await toggleHabit(habit, now)
      return
    }
    await e.save('priority_task_logs', {
      id: logIdFor(item.id, item.date),
      user_id: uid,
      task_id: item.id,
      date: item.date,
      completed_at: now.toISOString(),
      deleted_at: null,
    })
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
