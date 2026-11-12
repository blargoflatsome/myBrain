// Reading and writing habits and their logs (SPEC §5 Habits).
import type { HabitLogRow, HabitPauseRow, HabitRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { logIdFor, missedDaysToRecord, newHabit, pauseFrom, resumeAfter, streaks, toggleAction, wrongMisses } from '@/habits/rules'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { live } from '@/sync/live'
import { achieved } from '@/celebrate/bus'

export function habitActions({ ready, habitsReady }: ActionContext) {
  async function addHabit(title: string) {
    const { engine: e, uid } = ready()
    if (!title.trim()) return null
    return e.save('habits', newHabit(title, uid, deviceTimeZone()))
  }

  /** Delete a habit; any routine step linked to it is removed too (SPEC §5 Routines). */
  async function deleteHabit(id: string) {
    const { engine: e, local } = ready()
    await e.remove('habits', id)
    await e.removeMany('routine_steps', live(await local.routine_steps.toArray()).filter((s) => s.habit_id === id).map((s) => s.id))
  }

  async function logsFor(habitId: string): Promise<HabitLogRow[]> {
    return ready().local.habit_logs.where('habit_id').equals(habitId).toArray()
  }
  async function pauses(): Promise<HabitPauseRow[]> {
    return live(await ready().local.habit_pauses.toArray())
  }

  /** Pause all streaks from today, or end the pause after today (SPEC §5 Habits). */
  async function setStreaksPaused(on: boolean, now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid } = ready()
    const today = todayIn(timeZone, now)
    const change = on ? pauseFrom(await pauses(), today, uid) : resumeAfter(await pauses(), today)
    if (change) await e.save('habit_pauses', change)
    for (const habit of live(await ready().local.habits.toArray())) await refreshHabit(habit, now, timeZone)
  }

  /**
   * Write a "missed" log for each scheduled day whose deadline passed, then refresh the cached streak numbers from
   * the logs. Safe to run often; it only writes when something changed.
   */
  async function refreshHabit(habit: HabitRow, now = new Date(), timeZone = deviceTimeZone()) {
    if (!habitsReady.value) return
    const { engine: e, uid } = ready()
    let logs = await logsFor(habit.id)
    // Remove "missed" logs whose day is still open (written too early, e.g. on the day the habit was created).
    for (const wrong of wrongMisses(habit, logs, now, timeZone)) {
      await e.remove('habit_logs', wrong.id)
      logs = logs.map((l) => (l.id === wrong.id ? { ...l, deleted_at: now.toISOString() } : l))
    }
    const paused = await pauses()
    for (const date of missedDaysToRecord(habit, logs, now, timeZone, paused)) {
      const log: HabitLogRow = { id: logIdFor(habit.id, date), user_id: uid, habit_id: habit.id, date, status: 'missed', deleted_at: null }
      await e.save('habit_logs', log)
      logs = [...logs, log]
    }
    const { current, best } = streaks(habit, logs, now, timeZone, paused)
    // Update only the cached numbers on the latest copy, in one step, so an edit saved meanwhile is kept.
    await e.patch('habits', habit.id, (fresh) =>
      current !== fresh.current_streak || best !== fresh.best_streak ? { current_streak: current, best_streak: best } : null,
    )
  }

  /** Complete today's habit, or undo a completion before its deadline. */
  async function toggleHabit(habit: HabitRow, now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid } = ready()
    const date = todayIn(timeZone, now)
    const action = toggleAction(habit, date, await logsFor(habit.id), now, timeZone, await pauses())
    if (action.kind === 'complete') {
      await e.save('habit_logs', {
        id: logIdFor(habit.id, date),
        user_id: uid,
        habit_id: habit.id,
        date,
        status: 'completed',
        completed_at: now.toISOString(),
        deleted_at: null,
      })
    } else if (action.kind === 'undo') {
      await e.remove('habit_logs', action.log.id)
    }
    await refreshHabit(habit, now, timeZone)
    if (action.kind === 'complete') achieved({ kind: 'habit', habit })
    return action.kind
  }

  /** Complete a habit for today if it is still open (never undoes a completion). */
  async function completeHabit(habit: HabitRow, now = new Date(), timeZone = deviceTimeZone()) {
    const date = todayIn(timeZone, now)
    if (toggleAction(habit, date, await logsFor(habit.id), now, timeZone, await pauses()).kind === 'complete') await toggleHabit(habit, now, timeZone)
  }

  return { addHabit, deleteHabit, refreshHabit, toggleHabit, completeHabit, setStreaksPaused }
}
