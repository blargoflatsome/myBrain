// SPEC §5 Dashboard "Up next": one suggestion at a time of what to do now, in a fixed order of what matters most.
// Pure rules: the Dashboard reads the rows, this decides; skipped suggestions are left out by the caller's list.
import type { DayData } from '@/journal/stats'
import type { EventInviteRow, EventRow, InboxRow, JournalEntryRow, TaskRow } from '@/sync/types'
import { dayStatus, deadline, isScheduled as habitScheduled, streaks, zonedTime } from '@/habits/rules'
import { isAnytime, isScheduled as routineScheduled, runFor } from '@/routines/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { occursOn } from '@/events/rules'
import { carryOverCount, tasksForDay } from '@/tasks/rules'
import { plainText } from '@/journal/body'
import { todayIn } from '@/tasks/days'
import { live } from '@/sync/live'

/** "Soon" for habits and events (SPEC §5 Dashboard). */
export const SOON_MS = 2 * 60 * 60_000
/** A habit on a run this long gets the "keep it going" wording. */
export const KEEP_GOING_DAYS = 3
/** A task carried over this many times asks "Still want this?". */
export const STUCK_TIMES = 3
/** When the journal suggestion starts without a journal reminder time. */
export const JOURNAL_TIME = '19:00'

export type Suggestion =
  | { key: string; kind: 'priority_habit'; id: string; title: string }
  | { key: string; kind: 'priority_task'; id: string; title: string; date: string }
  | { key: string; kind: 'habit'; id: string; title: string; by: number; streak: number }
  | { key: string; kind: 'routine'; id: string; title: string; started: boolean }
  | { key: string; kind: 'event'; id: string; title: string; date: string; time: string }
  | { key: string; kind: 'stuck_task'; id: string; title: string; times: number }
  | { key: string; kind: 'task'; id: string; title: string }
  | { key: string; kind: 'orphans'; count: number }
  | { key: string; kind: 'journal' }

export interface UpNextData extends DayData {
  events: EventRow[]
  invites: EventInviteRow[]
  inbox: InboxRow[]
  journal: JournalEntryRow[]
  me: string | null
}

/**
 * Everything worth doing now, in Up next's order (SPEC §5 Dashboard). An empty list means nothing is left
 * ("Past you cleared the decks."). `journalTime` is my journal reminder time, if I set one.
 */
export function upNext(data: UpNextData, now: Date, timeZone: string, journalTime: string | null = null): Suggestion[] {
  const today = todayIn(timeZone, now)
  const at = now.getTime()
  const pauses = live(data.habitPauses ?? [])
  const out: Suggestion[] = []

  // 1. Priority habits and priority tasks due today, earliest reminder first.
  const priority: { when: number; s: Suggestion }[] = []
  const openHabits = live(data.habits).filter((h) => habitScheduled(h, today) && dayStatus(h, today, data.habitLogs, now, timeZone, pauses) === 'open')
  for (const h of openHabits.filter((h) => h.is_priority)) {
    priority.push({ when: h.notify_time ? zonedTime(today, h.notify_time, timeZone) : deadline(h, today, timeZone), s: { key: `habit:${h.id}`, kind: 'priority_habit', id: h.id, title: h.title } })
  }
  const taskLogs = live(data.priorityTaskLogs)
  for (const t of live(data.priorityTasks).filter((t) => isTaskScheduled(t, today) && !taskLogs.some((l) => l.task_id === t.id && l.date === today))) {
    priority.push({ when: zonedTime(today, t.reminder_time, timeZone), s: { key: `priority:${t.id}`, kind: 'priority_task', id: t.id, title: t.title, date: today } })
  }
  out.push(...priority.sort((a, b) => a.when - b.when).map((p) => p.s))

  // 2. Habits due in the next 2 hours, soonest first; a run of 3+ days gets "keep it going".
  out.push(
    ...openHabits
      .filter((h) => !h.is_priority)
      .map((h) => ({ h, by: deadline(h, today, timeZone) }))
      .filter(({ by }) => by - at <= SOON_MS)
      .sort((a, b) => a.by - b.by)
      .map(({ h, by }) => ({ key: `habit:${h.id}`, kind: 'habit' as const, id: h.id, title: h.title, by, streak: streaks(h, data.habitLogs.filter((l) => l.habit_id === h.id), now, timeZone, pauses).current })),
  )

  // 3. Routines scheduled today, not finished, once their reminder time has passed.
  for (const r of live(data.routines)) {
    if (isAnytime(r) || !routineScheduled(r, today)) continue
    if (r.notify_time && at < zonedTime(today, r.notify_time, timeZone)) continue
    const run = runFor(data.routineRuns, r.id, today)
    if (run?.finished_at) continue
    out.push({ key: `routine:${r.id}`, kind: 'routine', id: r.id, title: r.title, started: !!run })
  }

  // 4. Events starting in the next 2 hours: mine, or ones I said Yes to.
  const going = new Set(live(data.invites).filter((i) => i.response === 'yes').map((i) => i.event_id))
  const events = live(data.events)
    .filter((e) => !e.cancelled_at && e.start_time && (!data.me || !e.user_id || e.user_id === data.me || going.has(e.id)) && occursOn(e, today))
    .map((e) => ({ e, start: zonedTime(today, e.start_time!, timeZone) }))
    .filter(({ start }) => start > at && start - at <= SOON_MS)
    .sort((a, b) => a.start - b.start)
  out.push(...events.map(({ e }) => ({ key: `event:${e.id}`, kind: 'event' as const, id: e.id, title: e.title, date: today, time: e.start_time!.slice(0, 5) })))

  // 5 and 6. Today's open tasks in the Tasks page order; ones carried over 3+ times first, asking "Still want this?".
  const open = tasksForDay(data.tasks as TaskRow[], today, today, timeZone).filter((t) => t.status === 'open')
  const stuck = open.filter((t) => carryOverCount(t, today) >= STUCK_TIMES)
  out.push(...stuck.map((t) => ({ key: `task:${t.id}`, kind: 'stuck_task' as const, id: t.id, title: t.title, times: carryOverCount(t, today) })))
  out.push(...open.filter((t) => !stuck.includes(t)).map((t) => ({ key: `task:${t.id}`, kind: 'task' as const, id: t.id, title: t.title })))

  // 7. Orphans waiting to be sorted.
  const orphans = live(data.inbox).length
  if (orphans) out.push({ key: 'orphans', kind: 'orphans', count: orphans })

  // 8. Tonight's journal, from my journal reminder time (or 7 pm), if I haven't written today.
  const wrote = live(data.journal).some((e) => e.date === today && !e.auto && plainText(e.body))
  if (!wrote && at >= zonedTime(today, (journalTime ?? JOURNAL_TIME).slice(0, 5), timeZone)) out.push({ key: 'journal', kind: 'journal' })

  return out
}

/** Skipped suggestions are kept for today only (SPEC §5 Dashboard). */
export function skippedToday(saved: { date: string; keys: string[] } | null, today: string): string[] {
  return saved?.date === today ? saved.keys : []
}
