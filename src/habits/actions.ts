// Reading and writing habits and their logs (SPEC §5 Habits).
import type { HabitLogRow, HabitPauseRow, HabitRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { logIdFor, missedDaysToRecord, newHabit, pauseFrom, resumeAfter, streaks, toggleAction, withHabitRules, wrongMisses } from '@/habits/rules'
import { deviceTimeZone, todayIn } from '@/time/days'
import { live } from '@/sync/live'
import { achieved } from '@/celebrate/bus'
import { saveItemTags } from '@/tags/actions'

/** A new habit as Capture, Orphans or the habit editor gives it: a name, and any settings chosen (the rest are defaults). */
export type HabitDraft = Partial<Omit<HabitRow, 'user_id' | 'current_streak' | 'best_streak' | 'deleted_at' | 'created_at'>> & {
  title: string
  /** Tag names from the editor, saved after the habit. */
  tags?: string[]
}

export function habitActions({ ready, habitsReady }: ActionContext) {
  /** Add a habit (SPEC §5 Habits): every day from today unless chosen otherwise. Returns null when it has no name. */
  async function addHabit(draft: HabitDraft, now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid } = ready()
    if (!draft.title.trim()) return null
    const base = newHabit(draft.title, uid, timeZone, now, draft.id)
    const { tags, ...fields } = draft
    const chosen = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
    const row = withHabitRules({ ...base, ...chosen, id: base.id, user_id: uid, current_streak: 0, best_streak: 0, deleted_at: null, created_at: now.toISOString() }, base.start_date)
    const saved = await e.save('habits', row)
    if (tags) await saveItemTags(ready, 'habit', saved.id, tags)
    return saved
  }

  /**
   * Save a habit as edited (SPEC §5 Habits): the same rules as a new one, except a start date already past is kept.
   * Its streak is worked out again, since changing its days or start changes which days count. With `tags`, those too.
   */
  async function saveHabit(habit: HabitRow, tags?: string[], now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid, local } = ready()
    const today = todayIn(timeZone, now)
    const before = await local.habits.get(habit.id)
    const earliest = before && before.start_date < today ? before.start_date : today
    const saved = await e.save('habits', withHabitRules({ ...habit, user_id: uid }, earliest))
    if (tags) await saveItemTags(ready, 'habit', saved.id, tags)
    await refreshHabit(saved, now, timeZone)
    return saved
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

  return { addHabit, saveHabit, deleteHabit, refreshHabit, toggleHabit, completeHabit, setStreaksPaused }
}
