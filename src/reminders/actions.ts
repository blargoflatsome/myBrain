// What the priority reminder's slide, snooze and cancel write (SPEC §5 High-priority tasks and priority habits).
import type { HabitRow, ReminderStateRow, TaskRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { cancelState, snoozeState, type DuePriority } from '@/reminders/priority'
import { toggleDone } from '@/tasks/rules'

type NextState = (item: DuePriority, existing: ReminderStateRow | undefined, uid: string, now: Date) => ReminderStateRow

export function priorityActions(
  { ready }: ActionContext,
  toggleHabit: (habit: HabitRow, now: Date) => Promise<unknown>,
  saveTask: (task: TaskRow) => Promise<unknown>,
) {
  /** Slide to complete: a priority habit is completed for the day; a High task is crossed off. */
  async function completePriority(item: DuePriority, now = new Date()) {
    const { local } = ready()
    if (item.kind === 'habit') {
      const habit = await local.habits.get(item.id)
      if (habit) await toggleHabit(habit, now)
      return
    }
    const task = await local.tasks.get(item.id)
    if (task && task.status === 'open') await saveTask(toggleDone(task, now))
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
