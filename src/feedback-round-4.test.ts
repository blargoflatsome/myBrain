import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addMonths, monthGrid, parseDate } from '@/time/parseDate'
import { dayLabel, dayTimeLabel, momentLabel, timeLabel } from '@/ui/dates'
import { cleanHtml, storedNotes, textLines } from '@/journal/body'
import { fitTitle } from '@/capture/capture'
import { finishQuest, pickQuest } from '@/quests/picker'
import { questsFinished, tasksDone, yesterdaySummary } from '@/dashboard/stats'
import { clearDone, clearedForDay, tasksForDay, toggleDone, undatedTasks } from '@/tasks/rules'
import { icsFile } from '@/events/ics'
import type { QuestRow, TaskRow } from '@/sync/types'

const TODAY = '2026-11-10' // a Tuesday

describe('Spec §5 Date fields: typing a day', () => {
  it.each([
    ['tomorrow', '2026-11-11'],
    ['today', '2026-11-10'],
    ['Fri', '2026-11-13'],
    ['next Friday', '2026-11-20'],
    ['Nov 20', '2026-11-20'],
    ['11/20', '2026-11-20'],
    ['2026-12-03', '2026-12-03'],
    ['in 3 days', '2026-11-13'],
    ['Tue, Nov 10', '2026-11-10'],
  ])('"%s" is %s', (typed, day) => {
    expect(parseDate(typed, TODAY)).toBe(day)
  })

  it('a day with no year means the next one coming, never the past', () => {
    expect(parseDate('Jan 5', TODAY)).toBe('2027-01-05')
  })

  it('what isn\'t a day (or an impossible date) gives nothing, so the box goes back to the saved day', () => {
    for (const t of ['', 'banana', 'may', '8pm', '2026-02-30']) expect(parseDate(t, TODAY)).toBeNull()
  })

  it('the month grid starts on Sunday and covers the whole month', () => {
    const weeks = monthGrid('2026-11-01')
    expect(weeks[0]![0]).toBe('2026-11-01') // Nov 1 2026 is a Sunday
    expect(weeks.flat()).toContain('2026-11-30')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(monthGrid('2026-12-01')[0]![0]).toBe('2026-11-29')
  })

  it('Page Up / Page Down keep the day inside a shorter month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2026-11-10', -1)).toBe('2026-10-10')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })
})

describe('Spec §5 Dates and times: shown the same way everywhere', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T15:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('days show weekday, month and day, with the year only when it isn\'t this year', () => {
    expect(dayLabel('2026-11-12', TODAY)).toMatch(/Thu.*Nov.*12/)
    expect(dayLabel('2026-11-12', TODAY)).not.toMatch(/2026/)
    expect(dayLabel('2027-01-05', TODAY)).toMatch(/2027/)
  })

  it('times show the device\'s way, and a day with a time joins them with a dot', () => {
    expect(timeLabel('08:30:00')).toMatch(/8:30/)
    expect(dayTimeLabel('2026-11-12', '15:00', TODAY)).toMatch(/Nov.*12 · 3:00/)
    expect(dayTimeLabel('2026-11-12', null, TODAY)).not.toMatch(/·/)
  })

  it('a moment today shows just the time; an earlier one adds the day', () => {
    const now = new Date('2026-11-10T15:00:00')
    expect(momentLabel(new Date('2026-11-10T09:05:00').toISOString(), now)).not.toMatch(/Nov/)
    expect(momentLabel(new Date('2026-11-08T09:05:00').toISOString(), now)).toMatch(/Nov.*8 · 9:05/)
  })
})

describe('Spec §5 Formatted notes', () => {
  it('an empty editor saves no notes; formatting is kept and cleaned', () => {
    expect(storedNotes('<p></p>')).toBeNull()
    expect(storedNotes('')).toBeNull()
    expect(storedNotes('<p><strong>Bring</strong> snacks</p><script>alert(1)</script>')).toBe('<p><strong>Bring</strong> snacks</p>')
  })

  it('notes written before formatting existed still show, as paragraphs', () => {
    expect(cleanHtml('line one\nline <two>')).toBe('<p>line one</p><p>line &lt;two&gt;</p>')
  })

  it('a long first line in Capture moves into formatted notes as a paragraph in front', () => {
    const { notes } = fitTitle('Title\nmore words', '<p><em>mine</em></p>')
    expect(notes).toBe('<p>more words</p><p><em>mine</em></p>')
    expect(fitTitle('Title\nmore', 'plain notes').notes).toBe('more\n\nplain notes')
  })

  it('calendar files get the notes as plain lines, never HTML', () => {
    expect(textLines('<p>Bring <strong>snacks</strong></p><ul><li><p>chips</p></li><li><p>dip</p></li></ul>')).toBe('Bring snacks\nchips\ndip')
    expect(textLines('plain\ntext')).toBe('plain\ntext')
    const ics = icsFile({ uid: 'u', title: 'Party', notes: '<p>Bring <em>snacks</em></p><p>Wear blue</p>', start_date: TODAY, start_time: null, end_date: TODAY, end_time: null, repeat: 'never', timezone: 'America/New_York' })
    expect(ics).toContain('DESCRIPTION:Bring snacks\\nWear blue')
    expect(ics).not.toContain('<p>')
  })
})

describe('Spec §5 Random Quest: quests can be done again', () => {
  const quest = (id: string, extra: Partial<QuestRow> = {}): QuestRow => ({ id, title: id, status: 'open', deleted_at: null, ...extra })

  it('marking a quest done puts it back in the list, so the picker can offer it again', () => {
    const done = finishQuest(quest('a', { status: 'accepted' }), new Date('2026-11-10T15:00:00Z'))
    expect(done.status).toBe('open')
    expect(done.completed_at).toBe('2026-11-10T15:00:00.000Z')
    expect(pickQuest([done], {}, () => 0)?.id).toBe('a')
  })

  it('every time a quest is done counts on the Dashboard', () => {
    const logs = [1, 2, 3].map((n) => ({ id: `l${n}`, quest_id: 'a', date: `2026-11-0${n}`, completed_at: `2026-11-0${n}T12:00:00Z`, deleted_at: null }))
    expect(questsFinished(logs, '2026-11-02', new Date('2026-11-10T15:00:00Z'), 'America/New_York')).toBe(2)
  })

  it('"How past you did yesterday" shows quests done yesterday, even when nothing was scheduled', () => {
    const s = yesterdaySummary({ tasks: { done: 0, due: 0 }, habits: { kept: 0, scheduled: 0 }, routines: [], priority: [], streaks: [], quests: ['Paint the fence'] })
    expect(s.quests).toEqual(['Paint the fence'])
    expect(s.empty).toBe(false)
  })
})

describe('Spec §5 Tasks: Clear crossed-off hides done tasks but keeps them', () => {
  const TZ = 'America/New_York'
  const t = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({ id, title: id, due_date: DAY_T, status: 'open', source: 'manual', deleted_at: null, ...extra })
  const DAY_T = '2026-11-10'
  const doneAt = '2026-11-10T15:00:00Z'

  it('only crossed-off tasks are cleared; open ones stay', () => {
    const list = [t('a'), t('b', { status: 'done', completed_at: doneAt })]
    const cleared = clearDone(list, new Date('2026-11-10T16:00:00Z'))
    expect(cleared.map((x) => x.id)).toEqual(['b'])
    expect(cleared[0]!.cleared_at).toBe('2026-11-10T16:00:00.000Z')
    expect(cleared[0]!.deleted_at).toBeNull()
  })

  it('cleared tasks leave the day and Undated lists, but are still done for stats', () => {
    const cleared = t('b', { status: 'done', completed_at: doneAt, cleared_at: doneAt })
    const undated = t('u', { due_date: null, status: 'done', completed_at: doneAt, cleared_at: doneAt })
    expect(tasksForDay([cleared, t('a')], DAY_T, DAY_T, TZ).map((x) => x.id)).toEqual(['a'])
    expect(undatedTasks([undated])).toEqual([])
    expect(clearedForDay([cleared], DAY_T, TZ)).toHaveLength(1)
    expect(tasksDone([cleared], '2026-01-01', new Date('2026-11-10T20:00:00Z'), TZ)).toBe(1)
  })

  it('un-crossing a task brings it back to the list', () => {
    expect(toggleDone(t('b', { status: 'done', completed_at: doneAt, cleared_at: doneAt })).cleared_at).toBeNull()
  })
})

describe('Spec §5 Priority tasks: always in the future', () => {
  it('a repeating one starts today if its time is still to come, otherwise tomorrow', async () => {
    const { firstFutureDay } = await import('@/reminders/priority')
    expect(firstFutureDay('15:00', '2026-11-10', '09:20')).toBe('2026-11-10')
    expect(firstFutureDay('09:20', '2026-11-10', '09:20')).toBe('2026-11-11')
    expect(firstFutureDay('08:00:00', '2026-11-10', '09:20')).toBe('2026-11-11')
  })
  it('a one-off must be later than now', async () => {
    const { isLater } = await import('@/reminders/priority')
    expect(isLater('2026-11-10', '09:21', '2026-11-10', '09:20')).toBe(true)
    expect(isLater('2026-11-10', '09:20', '2026-11-10', '09:20')).toBe(false)
    expect(isLater('2026-11-09', '23:00', '2026-11-10', '09:20')).toBe(false)
    expect(isLater('2026-11-11', '00:00', '2026-11-10', '09:20')).toBe(true)
  })
})
