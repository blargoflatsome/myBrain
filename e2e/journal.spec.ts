import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { goTo } from './support/nav'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 8:00 pm.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T01:00:00Z')
const RID = 'aaaaaaaa-0000-4000-8000-000000000001'

let server: FakeSupabase

async function open(page: Page, path = '/journal', time = NOW) {
  await page.clock.install({ time })
  await page.goto(path)
}
const habit = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  notify_time: null,
  timer_minutes: null,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-11-01',
  is_private: false,
  current_streak: 0,
  best_streak: 0,
  ...extra,
})
const doneLog = (habitId: string, date: string) => ({ id: `${habitId}-${date}`, habit_id: habitId, date, status: 'completed', completed_at: `${date}T15:00:00Z` })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Journal', () => {
  test('the Journal is in the menu', async ({ page }) => {
    await open(page, '/')
    await goTo(page, 'Journal')
    await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeVisible()
    await expect(page.getByText('How did today go?')).toBeVisible()
  })

  test("today's stats are shown at a glance: tasks, habits, routines, priority, streaks and quests", async ({ page }) => {
    server.seed('tasks', [
      { id: 't1', title: 'Pay rent', due_date: '2026-11-10', status: 'done', completed_at: '2026-11-10T18:00:00Z', priority: 1, source: 'manual' },
      { id: 't2', title: 'Email Sam', due_date: '2026-11-10', status: 'open', priority: 1, source: 'manual' },
    ])
    server.seed('habits', [habit('h1', 'Meds', { is_priority: true }), habit('h2', 'Stretch')])
    server.seed('habit_logs', ['2026-11-08', '2026-11-09', '2026-11-10'].map((d) => doneLog('h1', d)))
    server.seed('routines', [{ id: RID, title: 'Morning', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' }])
    server.seed('routine_steps', ['Wake', 'Teeth', 'Shower', 'Meds'].map((title, i) => ({ id: `s${i}`, routine_id: RID, position: i, title, start_date: '2026-11-01' })))
    server.seed('routine_runs', [{ id: 'run1', routine_id: RID, date: '2026-11-10', started_at: '2026-11-10T12:00:00Z', finished_at: null }])
    server.seed('routine_step_logs', [
      { id: 'l1', run_id: 'run1', step_id: 's0', status: 'completed', logged_at: '2026-11-10T12:00:00Z' },
      { id: 'l2', run_id: 'run1', step_id: 's1', status: 'completed', logged_at: '2026-11-10T12:05:00Z' },
    ])
    server.seed('quests', [{ id: 'q1', title: 'Paint the fence', status: 'done', completed_at: '2026-11-10T20:00:00Z' }])

    await open(page)
    const today = page.getByTestId('journal-today')
    await expect(today.getByTestId('stat-tasks').getByTestId('stat-value')).toHaveText('1 of 2')
    await expect(today.getByTestId('stat-habits').getByTestId('stat-value')).toHaveText('1 of 2')
    await expect(today.getByRole('meter', { name: 'Morning' })).toHaveAttribute('aria-valuenow', '50')
    await expect(today.getByTestId('stat-priority')).toContainText('Meds')
    await expect(today.getByLabel('Meds: done')).toBeVisible()
    await expect(today.getByTestId('stat-streaks')).toContainText('Meds reached 3 days')
    await expect(today.getByTestId('stat-quests')).toContainText('Paint the fence')
  })

  test('what I write is saved to the day’s entry, with the day’s stats', async ({ page }) => {
    await open(page)
    const box = page.getByRole('textbox', { name: 'How the day went' })
    await expect(box).toHaveAttribute('placeholder', 'Tell me about it')
    await box.fill('Long day, but I got the rent paid.')
    await box.blur()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
    await expect
      .poll(() => server.written('journal_entries').find((e) => e.date === '2026-11-10' && e.body))
      .toMatchObject({ body: 'Long day, but I got the rent paid.', auto: false, stats_final: false, stats: { tasks: { done: 0, due: 0 } } })
  })

  test('a task added from the journal is due tomorrow by default', async ({ page }) => {
    await open(page)
    await expect(page.getByLabel('Due')).toHaveValue('2026-11-11')
    await page.getByRole('textbox', { name: 'Add a task for tomorrow' }).fill('Call the dentist')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Added "Call the dentist".')).toBeVisible()
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({ title: 'Call the dentist', due_date: '2026-11-11', source: 'journal', status: 'open' })
  })

  test('with no past entries, the empty journal says so', async ({ page }) => {
    await open(page)
    await expect(page.getByText('Past you let you down')).toBeVisible()
  })

  test('a day that ended without an entry is written for me, frozen, and I can still add to it', async ({ page }) => {
    server.seed('habits', [habit('h2', 'Stretch')])
    server.seed('habit_logs', [doneLog('h2', '2026-11-09')])
    server.seed('journal_entries', [
      { id: 'e8', date: '2026-11-08', body: 'Started journaling.', stats: {}, stats_final: true, auto: false },
    ])
    await open(page)

    await expect
      .poll(() => server.written('journal_entries').find((e) => e.date === '2026-11-09'))
      .toMatchObject({ auto: true, body: '', stats_final: true, stats: { habits: { kept: 1, scheduled: 1 } } })
    const entry = page.getByTestId('journal-entry-2026-11-09')
    await expect(entry).toContainText("Past you was busy this day, so here's what happened. Want to add a few words?")
    await expect(entry.getByTestId('stat-habits').getByTestId('stat-value')).toHaveText('1 of 1')

    await entry.getByRole('button', { name: 'Edit' }).click()
    await entry.getByRole('textbox', { name: 'How the day went' }).fill('Remembering now: it was a good one.')
    await entry.getByRole('button', { name: 'Done' }).click()
    await expect(entry).toContainText('Remembering now: it was a good one.')
    await expect
      .poll(() => server.written('journal_entries').filter((e) => e.date === '2026-11-09').at(-1))
      .toMatchObject({ body: 'Remembering now: it was a good one.', auto: false, stats_final: true })
  })

  test('a day that ended with nothing done gets no entry', async ({ page }) => {
    server.seed('habits', [habit('h2', 'Stretch')])
    server.seed('journal_entries', [
      { id: 'e8', date: '2026-11-08', body: 'Started journaling.', stats: {}, stats_final: true, auto: false },
    ])
    await open(page)
    await expect(page.getByTestId('journal-entry-2026-11-08')).toBeVisible()
    await page.clock.runFor(5_000)
    await expect(page.getByTestId('journal-entry-2026-11-09')).toHaveCount(0)
    expect(server.written('journal_entries').filter((e) => e.date === '2026-11-09')).toHaveLength(0)
  })

  test('the journal reminder is off by default and can be set on Profile', async ({ page }) => {
    await open(page, '/profile')
    const settings = page.getByTestId('journal-reminder')
    await expect(settings.getByRole('checkbox', { name: "Don't remind me" })).toBeChecked()
    await settings.getByRole('checkbox', { name: "Don't remind me" }).uncheck()
    await settings.getByLabel('Remind me at').fill('21:30')
    await page.getByRole('button', { name: 'Save reminder settings' }).click()
    await expect(page.getByTestId('notification-settings').getByText('Saved.')).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({ journal_reminder_time: '21:30' })
  })
})
