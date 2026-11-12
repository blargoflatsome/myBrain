import { describe, expect, it } from 'vitest'
import type { EventRow } from '@/sync/types'
import { calendarItems, eventProblem, newEvent, occurrences, occursOn } from '@/events/rules'

const UID = '11111111-2222-4333-8444-555555555555'

describe('Spec §5 Calendar: events repeat', () => {
  const e = (repeat: EventRow['repeat'], start = '2026-11-10'): EventRow => ({ ...newEvent(UID, start, '15:00', 'e1'), title: 'x', repeat })

  it('never, daily, weekdays, weekly, monthly and yearly', () => {
    expect(occursOn(e('never'), '2026-11-10')).toBe(true)
    expect(occursOn(e('never'), '2026-11-11')).toBe(false)
    expect(occursOn(e('daily'), '2026-11-09')).toBe(false)
    expect(occursOn(e('daily'), '2026-12-25')).toBe(true)
    expect(occursOn(e('weekdays'), '2026-11-13')).toBe(true)
    expect(occursOn(e('weekdays'), '2026-11-14')).toBe(false)
    expect(occursOn(e('weekly'), '2026-11-17')).toBe(true)
    expect(occursOn(e('weekly'), '2026-11-18')).toBe(false)
    expect(occursOn(e('monthly', '2026-01-31'), '2026-03-31')).toBe(true)
    expect(occursOn(e('monthly', '2026-01-31'), '2026-02-28')).toBe(false)
    expect(occursOn(e('yearly', '2020-11-11'), '2026-11-11')).toBe(true)
  })

  it('a multi-day event that began before the range still shows', () => {
    const trip: EventRow = { ...newEvent(UID, '2026-11-08', null, 'e2'), title: 'Trip', end_date: '2026-11-12' }
    expect(occurrences(trip, '2026-11-10', '2026-11-16')).toEqual(['2026-11-08'])
  })

  it('a new event lasts an hour from the chosen time, or is all day when a day is chosen', () => {
    expect(newEvent(UID, '2026-11-10', '15:30', 'x')).toMatchObject({ start_time: '15:30', end_time: '16:30', end_date: '2026-11-10' })
    expect(newEvent(UID, '2026-11-10', null, 'x')).toMatchObject({ start_time: null, end_time: null })
    expect(newEvent(UID, '2026-11-10', '23:30', 'x')).toMatchObject({ end_time: '23:59' })
  })

  it('an event needs a title and must not end before it starts', () => {
    expect(eventProblem({ ...newEvent(UID, '2026-11-10', '15:00', 'x'), title: ' ' })).toBe('title')
    expect(eventProblem({ ...newEvent(UID, '2026-11-10', '15:00', 'x'), title: 'a', end_time: '14:00' })).toBe('end')
    expect(eventProblem({ ...newEvent(UID, '2026-11-10', '15:00', 'x'), title: 'a' })).toBeNull()
  })

  it('the calendar shows dated tasks (priority colour), priority tasks at their time, and events', () => {
    const items = calendarItems(
      {
        tasks: [
          { id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 3, status: 'open', source: 'manual', deleted_at: null },
          { id: 't2', title: 'Undated', due_date: null, status: 'open', source: 'manual', deleted_at: null },
          { id: 't3', title: 'Cancelled', due_date: '2026-11-10', status: 'cancelled', source: 'manual', deleted_at: null },
        ],
        priorityTasks: [{ id: 'p1', title: 'Insulin', reminder_time: '12:00:00', due_date: null, weekdays: [2], start_date: '2026-11-01', deleted_at: null }],
        events: [{ ...e('weekly'), title: 'Standup' }],
      },
      '2026-11-09',
      '2026-11-15',
    )
    expect(items.map((i) => [i.title, i.start, i.allDay])).toEqual([
      ['‼ Pay rent', '2026-11-10', true],
      ['Priority: Insulin', '2026-11-10T12:00', false],
      ['Standup', '2026-11-10T15:00', false],
    ])
    expect(items[0]!.className).toContain('cal-high')
  })
})

