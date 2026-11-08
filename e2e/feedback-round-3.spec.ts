import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { goTo, openMore } from './support/nav'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:20 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:20:00Z')
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Habits: start date and how often', () => {
  test('Recycling: every other Thursday from Nov 12, reminder at 3 pm', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await dialog.getByLabel('Title').fill('Recycling')
    await dialog.getByLabel('Starts on').fill('2026-11-12')
    await dialog.getByRole('radiogroup', { name: 'How often' }).getByRole('radio', { name: 'Every 2 weeks' }).click()
    const days = dialog.getByRole('group', { name: 'Repeats on' })
    for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Fri', 'Sat']) await days.getByRole('button', { name: d }).click()
    await dialog.getByLabel('Reminder time (optional)').fill('15:00')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('habits')).toMatchObject({ title: 'Recycling', start_date: '2026-11-12', week_interval: 2, weekdays: [4], notify_time: '15:00', monthly: false })
  })

  test('every month on the start date’s day: the weekdays go away', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await dialog.getByLabel('Title').fill('Pay rent')
    await dialog.getByLabel('Starts on').fill('2026-12-01')
    await dialog.getByRole('radio', { name: 'Every month on the 1st' }).click()
    await expect(dialog.getByRole('group', { name: 'Repeats on' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('habits')).toMatchObject({ title: 'Pay rent', start_date: '2026-12-01', monthly: true })
  })

  test('a habit can’t start before today', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    await expect(page.getByRole('dialog', { name: 'New habit' }).getByLabel('Starts on')).toHaveAttribute('min', '2026-11-10')
  })

  test('Capture’s habit form has the start date and how often too', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('group', { name: 'What are you capturing?' }).getByRole('button', { name: 'Habit', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Trash')
    await page.getByLabel('Starts on').fill('2026-11-19')
    await page.getByRole('radio', { name: 'Every 2 weeks' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => lastWrite('habits')).toMatchObject({ title: 'Trash', start_date: '2026-11-19', week_interval: 2 })
  })
})

test.describe('Spec §5 Calendar: a new event starts at a time', () => {
  test('+ New event starts at the next whole hour for an hour; All day is a choice', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: '+ New event' }).click()
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await expect(dialog.getByRole('checkbox', { name: 'All day' })).not.toBeChecked()
    const start = dialog.getByLabel('Starts Time')
    await expect(start).toBeVisible()
    await dialog.getByLabel('Title').fill('Play Star Wars')
    await dialog.getByLabel('Repeat').selectOption({ label: 'Every 2 weeks' })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('events')).toMatchObject({ title: 'Play Star Wars', start_time: '10:00', end_time: '11:00', repeat: 'biweekly' })
  })

  test('turning All day off fills in a time', async ({ page }) => {
    server.seed('events', [{ id: 'e1', title: 'Holiday', notes: null, start_date: '2026-11-10', start_time: null, end_date: '2026-11-10', end_time: null, repeat: 'never', reminder_minutes: null }])
    await open(page, '/calendar?date=2026-11-10&event=e1')
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await dialog.getByRole('checkbox', { name: 'All day' }).uncheck()
    await expect(dialog.getByLabel('Starts Time')).not.toHaveValue('')
  })
})

test.describe('Spec §5 Tags: only on tasks, habits and routines', () => {
  test('habits and routines have tags; events, quests and the Vault don’t', async ({ page }) => {
    server.seed('quests', [{ id: 'q1', title: 'Bake bread', status: 'open', energy_level: 'ugh', time_bucket: '30m' }])
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    await expect(page.getByRole('dialog', { name: 'New habit' }).getByRole('combobox', { name: 'Add a tag' })).toBeVisible()
    await page.goto('/routines')
    await page.getByRole('button', { name: '+ New routine' }).click()
    await expect(page.getByRole('dialog', { name: 'New routine' }).getByRole('combobox', { name: 'Add a tag' })).toBeVisible()
    await page.goto('/calendar')
    await page.getByRole('button', { name: '+ New event' }).click()
    await expect(page.getByRole('dialog', { name: 'New event' }).getByRole('combobox', { name: 'Add a tag' })).toHaveCount(0)
    await page.goto('/quests')
    await page.getByRole('button', { name: /Bake bread/ }).click()
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Add a tag' })).toHaveCount(0)
  })

  test('a habit’s tag is saved, and search finds habits', async ({ page }) => {
    server.seed('habits', [{ id: 'h1', title: 'Take out recycling', notify_time: null, timer_minutes: null, weekdays: [4], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0 }])
    await open(page, '/habits')
    await page.getByRole('button', { name: /Take out recycling/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Edit habit' })
    await dialog.getByRole('combobox', { name: 'Add a tag' }).fill('chores')
    await dialog.getByRole('combobox', { name: 'Add a tag' }).press('Enter')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('item_tags')).toMatchObject({ item_type: 'habit', item_id: 'h1' })
    const header = page.getByRole('banner').getByRole('button', { name: 'Search' })
    if (await header.isVisible()) await header.click()
    else await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Search' }).click()
    const search = page.getByRole('dialog', { name: 'Search' })
    await search.getByRole('searchbox').fill('recycling')
    await expect(search.getByTestId('results-habit')).toContainText('Take out recycling')
    await search.getByTestId('search-result').first().click()
    await expect(page.getByRole('dialog', { name: 'Edit habit' })).toBeVisible()
  })
})

test.describe('Spec §5 Journal: pages of 3 days, and a save status under each box', () => {
  test('Earlier entries show 3 days per page', async ({ page }) => {
    server.seed('journal_entries', ['01', '02', '03', '04', '05', '06', '07'].map((d) => ({ id: `j${d}`, date: `2026-11-${d}`, body: `<p>Day ${d}</p>`, stats: {}, auto: false, stats_final: true })))
    await open(page, '/journal')
    const entries = page.locator('[data-testid^="journal-entry-"]')
    await expect(entries).toHaveCount(3)
    await expect(entries.first()).toContainText('Day 07')
    await page.getByRole('navigation', { name: 'Earlier' }).getByRole('button', { name: /Next/ }).click()
    await expect(entries.first()).toContainText('Day 04')
    await expect(page.getByTestId('page-position')).toHaveText('Page 2 of 3')
  })

  test('the save status also sits right under the writing box and the tomorrow box', async ({ page }) => {
    await open(page, '/journal')
    const today = page.getByTestId('journal-today')
    await page.getByRole('textbox', { name: 'How the day went' }).click()
    await page.keyboard.type('A good day')
    await expect(today.getByTestId('save-status-writing')).toHaveText('Saving…')
    await page.getByRole('textbox', { name: 'How to make tomorrow better?' }).click()
    await page.keyboard.type('Sleep early')
    await expect(today.getByTestId('save-status-tomorrow')).toHaveText('Saving…')
    await page.getByRole('heading', { name: 'Journal', level: 1 }).click()
    await expect(today.getByTestId('save-status-writing')).toHaveText('Saved')
    await expect(today.getByTestId('save-status-tomorrow')).toHaveText('Saved')
  })
})

test.describe('Spec §5 Focus timer', () => {
  async function openTimer(page: Page) {
    await openMore(page)
    await page.getByTestId('focus-open').locator('visible=true').click()
    return page.getByRole('dialog', { name: 'Focus timer' })
  }

  test('full screen: the time counting down and what to do; it moves on to a short break', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    const timer = await openTimer(page)
    await expect(timer.getByTestId('focus-phase')).toHaveText('Time to work')
    await expect(timer.getByTestId('focus-time')).toHaveText('25:00')
    await expect(timer.getByTestId('focus-round')).toHaveText('Round 1 of 4')
    await page.clock.runFor(60_000)
    await expect(timer.getByTestId('focus-time')).toHaveText('24:00')
    await page.clock.runFor(24 * 60_000 + 1000)
    await expect(timer.getByTestId('focus-phase')).toHaveText('Short break')
    await expect(timer.getByTestId('focus-time')).toHaveText(/^04:5\d$/)
  })

  test('minimize keeps it going as a pill on every page; tapping the pill opens it again; ✕ stops it', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    const timer = await openTimer(page)
    await timer.getByRole('button', { name: 'Minimize' }).click()
    await expect(timer).toHaveCount(0)
    const pill = page.getByTestId('focus-pill')
    await expect(pill).toContainText('Work · 25:00')
    await page.clock.runFor(2 * 60_000)
    await page.reload()
    await expect(page.getByTestId('focus-pill')).toContainText(/Work · 2[23]:\d\d/)
    await goTo(page, 'Habits')
    await page.getByTestId('focus-pill').click()
    const again = page.getByRole('dialog', { name: 'Focus timer' })
    await expect(again).toBeVisible()
    await again.getByRole('button', { name: 'Stop and close the timer' }).click()
    await expect(again).toHaveCount(0)
    await expect(page.getByTestId('focus-pill')).toHaveCount(0)
  })

  test('pause holds the time; skip moves to the next part', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    const timer = await openTimer(page)
    await timer.getByRole('button', { name: 'Pause' }).click()
    await page.clock.runFor(5 * 60_000)
    await expect(timer.getByTestId('focus-time')).toHaveText('25:00')
    await timer.getByRole('button', { name: 'Resume' }).click()
    await timer.getByRole('button', { name: 'Skip' }).click()
    await expect(timer.getByTestId('focus-phase')).toHaveText('Short break')
    await expect(timer.getByTestId('focus-time')).toHaveText('05:00')
  })
})
