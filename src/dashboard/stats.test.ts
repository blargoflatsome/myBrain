import { describe, expect, it } from 'vitest'
import type { EventRow, HabitLogRow, HabitRow, JournalEntryRow, RoutineRow, RoutineRunRow } from '@/sync/types'
import { eventStats, habitStats, journalStreaks, periodStart, questsFinished, routineSummaries, tasksDone } from './stats'

const TZ = 'America/New_York'
// Tue Nov 10 2026, 9 pm in New York.
const NOW = new Date('2026-11-11T02:00:00Z')
const TODAY = '2026-11-10'

const habit = (id: string, extra: Partial<HabitRow> = {}): HabitRow => ({
  id,
  title: id,
  notify_time: null,
  timer_minutes: null,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-11-01',
  is_private: false,
  current_streak: 0,
  best_streak: 0,
  deleted_at: null,
  ...extra,
})
const done = (habitId: string, date: string): HabitLogRow => ({ id: `${habitId}-${date}`, habit_id: habitId, date, status: 'completed', completed_at: `${date}T15:00:00Z`, deleted_at: null })
const days = (from: string, to: string) => {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10))
  return out
}

describe('Spec §5 Dashboard: the period', () => {
  it('This year starts January 1, Last 12 months a year back, All time has no start', () => {
    expect(periodStart('year', TODAY)).toBe('2026-01-01')
    expect(periodStart('12months', TODAY)).toBe('2025-11-11')
    expect(periodStart('all', TODAY)).toBeNull()
  })
})

describe('Spec §5 Dashboard: habits', () => {
  const habits = [habit('Meds', { start_date: '2026-10-01' }), habit('Stretch'), habit('Read', { start_date: '2026-11-08' })]
  const logs = [
    ...days('2026-10-01', '2026-11-10').map((d) => done('Meds', d)), // 41 days and counting
    ...days('2026-11-01', '2026-11-05').map((d) => done('Stretch', d)), // 5, then missed Nov 6-9 (today still open)
  ]
  const s = habitStats(habits, logs, NOW, TZ, null)

  it('every habit shows its current and longest streak', () => {
    expect(s.rows.map((r) => [r.habit.title, r.current, r.best])).toEqual([
      ['Meds', 41, 41],
      ['Stretch', 0, 5],
      ['Read', 0, 0],
    ])
  })

  it('the top 3 most-missed habits in the period', () => {
    expect(s.mostMissed.map((m) => [m.habit.title, m.missed])).toEqual([
      ['Stretch', 4],
      ['Read', 2],
    ])
    // Only misses within the period count.
    expect(habitStats(habits, logs, NOW, TZ, '2026-11-08').mostMissed.map((m) => [m.habit.title, m.missed])).toEqual([
      ['Read', 2],
      ['Stretch', 2],
    ])
  })

  it('longest current streak, best streak ever, and oldest habit are separate', () => {
    expect(s.longestCurrent?.habit.title).toBe('Meds')
    expect(s.bestEver).toMatchObject({ best: 41 })
    expect(s.oldest?.title).toBe('Meds')
    const other = habitStats([habit('Old', { start_date: '2025-01-01' }), habit('Hot')], [done('Hot', '2026-11-10')], NOW, TZ, null)
    expect(other.oldest?.title).toBe('Old')
    expect(other.longestCurrent?.habit.title).toBe('Hot')
  })
})

describe('Spec §5 Dashboard: journal streaks', () => {
  const entry = (date: string, body = '<p>x</p>'): JournalEntryRow => ({ id: date, date, body, stats: {}, stats_final: true, auto: !body, deleted_at: null })

  it('counts days in a row with an entry I wrote; entries the app wrote do not count', () => {
    const entries = [entry('2026-11-01'), entry('2026-11-02'), entry('2026-11-03'), entry('2026-11-04', ''), entry('2026-11-08'), entry('2026-11-09')]
    expect(journalStreaks(entries, TODAY)).toEqual({ current: 2, best: 3 })
  })
  it('the current streak is still alive today until the day ends', () => {
    expect(journalStreaks([entry('2026-11-09'), entry('2026-11-10')], TODAY).current).toBe(2)
    expect(journalStreaks([entry('2026-11-08')], TODAY).current).toBe(0)
  })
})

describe('Spec §5 Dashboard: events', () => {
  const event = (extra: Partial<EventRow>): EventRow => ({
    id: 'e',
    title: 'x',
    notes: null,
    start_date: '2026-11-10',
    start_time: '10:00',
    end_date: '2026-11-10',
    end_time: '11:00',
    repeat: 'never',
    reminder_minutes: null,
    created_at: '2026-11-01T12:00:00Z',
    deleted_at: null,
    ...extra,
  })

  it('created, attended (dates that have passed) and cancelled (deleted) in the period', () => {
    const events = [
      event({ id: 'past' }), // today 10-11 am: over by 9 pm
      event({ id: 'later', start_date: '2026-11-12', end_date: '2026-11-12' }),
      event({ id: 'weekly', start_date: '2026-10-27', end_date: '2026-10-27', repeat: 'weekly', created_at: '2025-06-01T12:00:00Z' }), // Oct 27, Nov 3, Nov 10
      event({ id: 'allday', start_time: null, end_time: null }), // today, all day: not over yet
      event({ id: 'gone', deleted_at: '2026-11-05T12:00:00Z' }),
    ]
    expect(eventStats(events, '2026-01-01', NOW, TZ)).toEqual({ created: 4, attended: 4, cancelled: 1 })
    expect(eventStats(events, null, NOW, TZ).created).toBe(5)
    expect(eventStats(events, '2026-11-01', NOW, TZ).attended).toBe(3)
  })
})

describe('Spec §5 Dashboard: events with invitations', () => {
  const base = { notes: null, start_time: '10:00', end_time: '11:00', repeat: 'never' as const, reminder_minutes: null, deleted_at: null }
  it('attended counts invited events I said Yes to; cancelled counts events I cancelled and ones I dropped out of', () => {
    const events: EventRow[] = [
      { ...base, id: 'mine', user_id: 'me', title: 'a', start_date: '2026-11-02', end_date: '2026-11-02', created_at: '2026-11-01T12:00:00Z' },
      { ...base, id: 'theirs-yes', user_id: 'host', title: 'b', start_date: '2026-11-03', end_date: '2026-11-03', created_at: '2026-11-01T12:00:00Z' },
      { ...base, id: 'theirs-maybe', user_id: 'host', title: 'c', start_date: '2026-11-04', end_date: '2026-11-04', created_at: '2026-11-01T12:00:00Z' },
      { ...base, id: 'mine-cancelled', user_id: 'me', title: 'd', start_date: '2026-11-05', end_date: '2026-11-05', created_at: '2026-11-01T12:00:00Z', cancelled_at: '2026-11-04T12:00:00Z' },
    ]
    const invites = [
      { id: 'i1', event_id: 'theirs-yes', response: 'yes' as const, deleted_at: null },
      { id: 'i2', event_id: 'theirs-maybe', response: 'maybe' as const, deleted_at: null },
      { id: 'i3', event_id: 'gone', response: 'dropped' as const, responded_at: '2026-11-06T12:00:00Z', deleted_at: null },
    ]
    expect(eventStats(events, '2026-01-01', NOW, TZ, invites, 'me')).toEqual({ created: 2, attended: 2, cancelled: 2 })
  })
})

describe('Spec §5 Dashboard: tasks, routines, quests', () => {
  it('tasks done and quests finished in the period', () => {
    const tasks = [
      { id: 't1', title: 'a', due_date: null, status: 'done' as const, completed_at: '2026-03-01T12:00:00Z', source: 'manual' as const, deleted_at: null },
      { id: 't2', title: 'b', due_date: null, status: 'done' as const, completed_at: '2025-12-01T12:00:00Z', source: 'manual' as const, deleted_at: null },
      { id: 't3', title: 'c', due_date: null, status: 'open' as const, source: 'manual' as const, deleted_at: null },
    ]
    expect(tasksDone(tasks, '2026-01-01', NOW, TZ)).toBe(1)
    expect(tasksDone(tasks, null, NOW, TZ)).toBe(2)
    // Each time a quest is done counts (SPEC §5 Random Quest: quests can be done again).
    const logs = [
      { id: 'l1', quest_id: 'q', date: '2026-11-02', completed_at: '2026-11-02T12:00:00Z', deleted_at: null },
      { id: 'l2', quest_id: 'q', date: '2026-11-05', completed_at: '2026-11-05T12:00:00Z', deleted_at: null },
      { id: 'l3', quest_id: 'q', date: '2025-11-05', completed_at: '2025-11-05T12:00:00Z', deleted_at: null },
    ]
    expect(questsFinished(logs, '2026-01-01', NOW, TZ)).toBe(2)
    expect(questsFinished(logs, null, NOW, TZ)).toBe(3)
  })

  it('a scheduled routine shows its rate in the period; a run-anytime one, times finished', () => {
    const morning: RoutineRow = { id: 'r1', title: 'Morning', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null }
    const garage: RoutineRow = { id: 'r2', title: 'Garage', weekdays: null, start_date: '2026-01-01', deleted_at: null }
    const runs: RoutineRunRow[] = [
      { id: 'a', routine_id: 'r1', date: '2026-11-02', started_at: 'x', finished_at: '2026-11-02T12:00:00Z', deleted_at: null },
      { id: 'b', routine_id: 'r2', date: '2026-05-02', started_at: 'x', finished_at: '2026-05-03T12:00:00Z', deleted_at: null },
    ]
    const steps = [{ id: 's1', routine_id: 'r1', position: 0, title: 's', start_date: '2026-11-01', deleted_at: null }]
    const out = routineSummaries([morning, garage], steps, runs, [], [], '2026-01-01', NOW, TZ)
    expect(out.map((r) => [r.routine.title, r.anytime, r.completed, r.possible])).toEqual([
      ['Morning', false, 1, 9],
      ['Garage', true, 1, 0],
    ])
    expect(routineSummaries([morning], steps, runs, [], [], '2026-11-05', NOW, TZ)[0]).toMatchObject({ completed: 0, possible: 5 })
  })
})
