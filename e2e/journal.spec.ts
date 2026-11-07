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
    const editor = page.getByRole('textbox', { name: 'How the day went' })
    await expect(editor.locator('p').first()).toHaveAttribute('data-placeholder', 'Tell me about it')
    await editor.click()
    await page.keyboard.type('Long day, but I got the rent paid.')
    await page.getByRole('heading', { name: 'Journal', level: 1 }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
    await expect
      .poll(() => server.written('journal_entries').find((e) => e.date === '2026-11-10' && e.body))
      .toMatchObject({ body: '<p>Long day, but I got the rent paid.</p>', auto: false, stats_final: false, stats: { tasks: { done: 0, due: 0 } } })
  })

  test('clearing all the writing saves the entry as empty', async ({ page }) => {
    await open(page)
    const editor = page.getByRole('textbox', { name: 'How the day went' })
    await editor.click()
    await page.keyboard.type('Preview check')
    await expect.poll(() => server.written('journal_entries').at(-1)?.body).toBe('<p>Preview check</p>')
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Delete')
    await expect.poll(() => server.written('journal_entries').at(-1)?.body).toBe('')
  })

  test('the writing can be formatted: bold, lists, checklists and links', async ({ page }) => {
    await open(page)
    const today = page.getByTestId('journal-today')
    const tools = page.getByRole('toolbar', { name: 'Formatting: How the day went' })
    const editor = today.getByRole('textbox', { name: 'How the day went' })
    await editor.click()
    await tools.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('Big win')
    await tools.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.press('Enter')
    await tools.getByRole('button', { name: 'Bulleted list' }).click()
    await page.keyboard.type('Rent paid')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await tools.getByRole('button', { name: 'Checklist' }).click()
    await page.keyboard.type('Call mum')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await tools.getByRole('button', { name: 'Link' }).click()
    await today.getByRole('textbox', { name: 'Link address' }).fill('example.com')
    await today.getByRole('button', { name: 'Apply' }).click()
    await expect(editor.locator('strong')).toHaveText('Big win')
    await expect(editor.locator('ul:not([data-type]) li')).toHaveText('Rent paid')
    await expect(editor.locator('ul[data-type="taskList"] li p')).toHaveText('Call mum')
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com')
    await expect
      .poll(() => String(server.written('journal_entries').at(-1)?.body ?? ''))
      .toMatch(/<strong>Big win<\/strong>.*<li><p>Rent paid<\/p><\/li>.*data-type="taskItem".*href="https:\/\/example.com"/)
  })

  test('the writing area can be opened full screen for easier typing', async ({ page }) => {
    await open(page)
    const today = page.getByTestId('journal-today')
    await page.getByRole('toolbar', { name: 'Formatting: How the day went' }).getByRole('button', { name: 'Full screen' }).click()
    const dialog = page.getByRole('dialog', { name: 'How the day went' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1)
    await page.keyboard.type('Typing with room to think.')
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(today.getByRole('textbox', { name: 'How the day went' })).toContainText('Typing with room to think.')
  })

  test('Add a task for tomorrow is its own box and opens the Capture window over the Journal, keeping my writing', async ({ page }) => {
    await open(page)
    await page.getByRole('textbox', { name: 'How the day went' }).click()
    await page.keyboard.type('Halfway through writing')
    const box = page.getByTestId('journal-add-task')
    await expect(page.getByTestId('journal-today').getByRole('button', { name: '+ Add a task for tomorrow' })).toHaveCount(0)
    await box.getByRole('button', { name: '+ Add a task for tomorrow' }).click()

    const dialog = page.getByRole('dialog', { name: 'Capture' })
    await expect(dialog.getByRole('heading', { name: 'Task', level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/journal$/)
    await expect(dialog.getByLabel(/^When\?/)).toHaveValue('2026-11-11')
    await dialog.getByLabel('Title', { exact: true }).fill('Call the dentist')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByTestId('capture-notice')).toBeVisible()
    // Ready for another task for tomorrow.
    await expect(dialog.getByLabel(/^When\?/)).toHaveValue('2026-11-11')
    await dialog.getByLabel('Title', { exact: true }).fill('Book the car service')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByRole('button', { name: 'Close' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('textbox', { name: 'How the day went' })).toContainText('Halfway through writing')
    await expect.poll(() => server.written('tasks').length).toBe(2)
    expect(server.written('tasks')).toEqual([
      expect.objectContaining({ title: 'Call the dentist', due_date: '2026-11-11', source: 'journal', status: 'open' }),
      expect.objectContaining({ title: 'Book the car service', due_date: '2026-11-11', source: 'journal', status: 'open' }),
    ])
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
    await entry.getByRole('textbox', { name: 'How the day went' }).click()
    await page.keyboard.type('Remembering now: it was a good one.')
    await entry.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(entry.getByTestId('journal-body')).toHaveText('Remembering now: it was a good one.')
    await expect
      .poll(() => server.written('journal_entries').filter((e) => e.date === '2026-11-09').at(-1))
      .toMatchObject({ body: '<p>Remembering now: it was a good one.</p>', auto: false, stats_final: true })
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

  test('the journal reminder is off by default and can be set on the Account page', async ({ page }) => {
    await open(page, '/account')
    const settings = page.getByTestId('journal-reminder')
    await expect(settings.getByRole('checkbox', { name: "Don't remind me" })).toBeChecked()
    await settings.getByRole('checkbox', { name: "Don't remind me" }).uncheck()
    await settings.getByLabel('Remind me at').fill('21:30')
    await page.getByRole('button', { name: 'Save reminder settings' }).click()
    await expect(page.getByTestId('notification-settings').getByText('Saved.')).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({ journal_reminder_time: '21:30' })
  })
})
