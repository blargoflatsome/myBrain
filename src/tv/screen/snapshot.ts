// SPEC §9 TV app, The dashboard: what the TV shows, from one tv_snapshot call. It's asked for again every 30 seconds,
// on waking from the night screen and when the month changes. Habit logs come in full once, then only the ones changed
// since, kept here between calls (What it reads).
import { serverCall } from '@/server/server'
import type { EventInviteRow, EventRow, HabitLogRow, HabitPauseRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow, TaskRow } from '@/sync/types'
import type { UpNextFacts } from '@/dashboard/upNext'

export const REFRESH_MS = 30_000
/** Logs are asked for from a little before the last answer, so one saved while it was being read isn't missed. */
const OVERLAP_MS = 60_000

export interface SnapshotAnswer {
  me: string
  now: string
  tasks: TaskRow[]
  events: EventRow[]
  invites: EventInviteRow[]
  habits: HabitRow[]
  habit_logs: HabitLogRow[]
  habit_pauses: HabitPauseRow[]
  routines: RoutineRow[]
  routine_runs: RoutineRunRow[]
  routine_steps: RoutineStepRow[]
  routine_step_logs: RoutineStepLogRow[]
  orphans: number
  wrote_today: boolean
  journal_time: string | null
}

export interface Snapshot {
  facts: UpNextFacts
  /** My routines' steps, and the logs of the runs in `facts.routineRuns` (SPEC §9 Routines). */
  routineSteps: RoutineStepRow[]
  stepLogs: RoutineStepLogRow[]
  journalTime: string | null
}

/** Keeps the habit logs between calls; `load` asks for the weeks shown and today, and returns everything. */
export function snapshotLoader(key: () => string | null) {
  const logs: Record<string, HabitLogRow> = {}
  let since: string | null = null

  async function load(from: string, to: string, today: string): Promise<Snapshot> {
    const a = await serverCall<SnapshotAnswer>('tv_snapshot', { device_key: key(), from_date: from, to_date: to, today, logs_since: since })
    for (const l of a.habit_logs) {
      if (l.deleted_at) delete logs[l.id]
      else logs[l.id] = l
    }
    since = new Date(new Date(a.now).getTime() - OVERLAP_MS).toISOString()
    return {
      facts: {
        tasks: a.tasks,
        events: a.events,
        invites: a.invites,
        me: a.me,
        habits: a.habits,
        habitLogs: Object.keys(logs).map((id) => logs[id]!),
        habitPauses: a.habit_pauses,
        routines: a.routines,
        routineRuns: a.routine_runs,
        orphans: a.orphans,
        wroteToday: a.wrote_today,
      },
      routineSteps: a.routine_steps,
      stepLogs: a.routine_step_logs,
      journalTime: a.journal_time,
    }
  }
  /** Start over with every log (after pairing again, maybe to another account). */
  function reset() {
    for (const id of Object.keys(logs)) delete logs[id]
    since = null
  }
  return { load, reset }
}
