import { describe, expect, it } from 'vitest'
import type { EventRow, HabitLogRow, HabitRow, PriorityTaskRow, RoutineRow, TaskRow } from '@/sync/types'
import { skippedToday, upNext, type UpNextData } from '@/dashboard/upNext'
import { closestTrophy, type BoardItem } from '@/trophies/board'
import { yesterdayLeftovers } from '@/dashboard/stats'

const TZ = 'America/New_York'
const TODAY = '2026-11-10'
// Tue Nov 10 2026 in New York (UTC-5).
const at = (hhmm: string) => new Date(`${TODAY}T${hhmm}:00-05:00`)

const empty = (): UpNextData => ({
  tasks: [], habits: [], habitLogs: [], habitPauses: [], routines: [], routineSteps: [], routineRuns: [], routineStepLogs: [],
  priorityTasks: [], priorityTaskLogs: [], quests: [], questLogs: [], events: [], invites: [], inbox: [], journal: [], me: 'me',
})
const habit = (id: string, extra: Partial<HabitRow> = {}): HabitRow => ({
  id, title: id, notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0, deleted_at: null, ...extra,
})
const kept = (habitId: string, date: string): HabitLogRow => ({ id: `${habitId}-${date}`, habit_id: habitId, date, status: 'completed', completed_at: `${date}T15:00:00Z`, deleted_at: null })
const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({ id, title: id, due_date: TODAY, status: 'open', priority: 1, source: 'manual', deleted_at: null, ...extra })
const routine = (id: string, extra: Partial<RoutineRow> = {}): RoutineRow => ({ id, title: id, notify_time: '08:00', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null, ...extra })
const event = (id: string, start: string, extra: Partial<EventRow> = {}): EventRow => ({
  id, title: id, start_date: TODAY, start_time: start, end_date: TODAY, end_time: '23:00', repeat: 'never', reminder_minutes: null, user_id: 'me', deleted_at: null, ...extra,
})
const priorityTask = (id: string, time: string): PriorityTaskRow => ({ id, title: id, reminder_time: time, due_date: TODAY, weekdays: null, start_date: TODAY, deleted_at: null })
const keys = (data: UpNextData, now: Date, journalTime: string | null = null) => upNext(data, now, TZ, journalTime).map((s) => s.key)

describe('SPEC §5 Dashboard Up next: what comes first', () => {
  it('priority items, then habits due soon, routines, events soon, stuck tasks, tasks, Orphans, then the journal', () => {
    const d = empty()
    d.habits = [habit('meds', { is_priority: true, notify_time: '21:00' }), habit('stretch', { notify_time: '20:00', timer_minutes: 60 }), habit('later')]
    d.priorityTasks = [priorityTask('pills', '20:00')]
    d.routines = [routine('night', { notify_time: '20:00' })]
    d.events = [event('call', '21:30')]
    d.tasks = [task('rent', { priority: 3 }), task('old', { due_date: '2026-11-07' })]
    d.inbox = [{ id: 'o1', body: 'idea', deleted_at: null }]
    expect(keys(d, at('20:30'))).toEqual(['priority:pills', 'habit:meds', 'habit:stretch', 'routine:night', 'event:call', 'task:old', 'task:rent', 'orphans', 'journal'])
  })

  it('nothing to do gives an empty list (Past you cleared the decks)', () => {
    expect(upNext(empty(), at('10:00'), TZ)).toEqual([])
  })
})

describe('SPEC §5 Dashboard Up next: each rule', () => {
  it('a habit shows only in the 2 hours before its deadline, with its streak; done habits never', () => {
    const d = empty()
    d.habits = [habit('walk'), habit('done')]
    d.habitLogs = ['2026-11-07', '2026-11-08', '2026-11-09'].map((day) => kept('walk', day)).concat(kept('done', TODAY))
    const night = '23:59' // journal reminder time, so only habits show
    expect(keys(d, at('21:59'), night)).toEqual([])
    expect(upNext(d, at('22:00'), TZ, night)).toMatchObject([{ kind: 'habit', id: 'walk', streak: 3 }])
  })

  it('a routine shows from its reminder time until it is finished', () => {
    const d = empty()
    d.routines = [routine('morning'), routine('anytime', { weekdays: null })]
    expect(keys(d, at('07:59'))).toEqual([])
    expect(upNext(d, at('08:00'), TZ)).toMatchObject([{ id: 'morning', started: false }])
    d.routineRuns = [{ id: 'run', routine_id: 'morning', date: TODAY, started_at: `${TODAY}T13:00:00Z`, finished_at: null, deleted_at: null }]
    expect(upNext(d, at('09:00'), TZ)).toMatchObject([{ id: 'morning', started: true }])
    d.routineRuns[0]!.finished_at = `${TODAY}T14:00:00Z`
    expect(keys(d, at('09:00'))).toEqual([])
  })

  it('an event shows in the 2 hours before it starts: mine or ones I said Yes to, not cancelled ones', () => {
    const d = empty()
    d.events = [
      event('mine', '12:00'),
      event('later', '12:01'),
      event('yes', '11:00', { user_id: 'host' }),
      event('maybe', '11:00', { user_id: 'host' }),
      event('off', '11:00', { cancelled_at: '2026-11-09T12:00:00Z' }),
      event('all-day', '', { start_time: null }),
    ]
    d.invites = [
      { id: 'i1', event_id: 'yes', response: 'yes', deleted_at: null },
      { id: 'i2', event_id: 'maybe', response: 'maybe', deleted_at: null },
    ]
    expect(keys(d, at('10:00'))).toEqual(['event:yes', 'event:mine'])
    expect(keys(d, at('12:00'))).toEqual(['event:later'])
  })

  it('a task carried over 3 or more times asks "Still want this?"', () => {
    const d = empty()
    d.tasks = [task('twice', { due_date: '2026-11-08' }), task('thrice', { due_date: '2026-11-07' })]
    expect(upNext(d, at('10:00'), TZ)).toMatchObject([
      { kind: 'stuck_task', id: 'thrice', times: 3 },
      { kind: 'task', id: 'twice' },
    ])
  })

  it.each([
    ['without a reminder time, from 7 pm', null, '18:59', '19:00'],
    ['from my journal reminder time', '21:30', '21:29', '21:30'],
  ])('tonight’s journal %s, until I write', (_, time, before, from) => {
    const d = empty()
    expect(keys(d, at(before), time)).toEqual([])
    expect(keys(d, at(from), time)).toEqual(['journal'])
    d.journal = [{ id: 'j', date: TODAY, body: '<p></p>', stats: {}, stats_final: false, auto: false, deleted_at: null }]
    expect(keys(d, at(from), time)).toEqual(['journal'])
    d.journal[0]!.body = '<p>Good day</p>'
    expect(keys(d, at(from), time)).toEqual([])
  })

  it('skipped suggestions are kept for today only', () => {
    expect(skippedToday({ date: TODAY, keys: ['orphans'] }, TODAY)).toEqual(['orphans'])
    expect(skippedToday({ date: '2026-11-09', keys: ['orphans'] }, TODAY)).toEqual([])
    expect(skippedToday(null, TODAY)).toEqual([])
  })
})

describe('SPEC §5 Dashboard: close to a trophy', () => {
  const item = (id: string, value: number, next: number): BoardItem => ({
    id, category: 'totals', level: 1, levels: 3, thresholds: [], tier: null, lastAt: null, lastDay: null, days: [], value, next, unit: 'count', hidden: false, locked: false,
  })
  it('the trophy nearest its next level, at least 75% of the way', () => {
    expect(closestTrophy([item('tasks_done', 74, 100)])).toBeNull()
    expect(closestTrophy([item('tasks_done', 75, 100), item('habit_checkins', 9, 10)])?.id).toBe('habit_checkins')
    // Same share: fewest left wins.
    expect(closestTrophy([item('tasks_done', 80, 100), item('habit_checkins', 8, 10)])?.id).toBe('habit_checkins')
  })
  it('surprises never show, and a trophy with no next level is left out', () => {
    expect(closestTrophy([item('that_was_fast', 9, 10)])).toBeNull()
    expect(closestTrophy([{ ...item('tasks_done', 100, 100), next: null }])).toBeNull()
  })
})

describe('SPEC §5 Dashboard: yesterday’s leftovers', () => {
  it('tasks due yesterday still open, High first; done, cancelled and older ones are left out', () => {
    const list = [
      task('low', { due_date: '2026-11-09' }),
      task('high', { due_date: '2026-11-09', priority: 3 }),
      task('done', { due_date: '2026-11-09', status: 'done' }),
      task('cancelled', { due_date: '2026-11-09', status: 'cancelled' }),
      task('older', { due_date: '2026-11-08' }),
    ]
    expect(yesterdayLeftovers(list, TODAY).map((t) => t.id)).toEqual(['high', 'low'])
  })
})
