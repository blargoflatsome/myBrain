import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'

const LONG_WORD = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query&and=more'

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Calendar: month first, read-only window with Edit', { tag: '@phone' }, () => {
  test.beforeEach(() => {
    server.seed('tasks', [{ id: 't1', title: LONG_LINE, notes: `<p>${LONG_WORD}</p>`, due_date: '2026-11-12', priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    server.seed('events', [{ id: 'e1', title: 'Dinner', notes: '<p>Bring <em>wine</em></p>', start_date: '2026-11-13', start_time: '19:00', end_date: '2026-11-13', end_time: '21:00', repeat: 'never', reminder_minutes: 60 }])
  })

  test('it opens on the month, on every screen size', async ({ page }) => {
    await open(page, '/calendar')
    await expect(page.getByTestId('calendar-title')).toHaveText('November 2026')
    await expect(page.getByRole('button', { name: msg.calendar.views.month })).toHaveAttribute('aria-pressed', 'true')
  })

  test('tapping a task opens it read-only over the calendar; Edit opens its editor there', async ({ page }) => {
    await open(page, '/calendar')
    await page.locator('.cal-task').first().click()
    const view = page.getByTestId('calendar-item')
    await expect(view).toBeVisible()
    await expect(view.getByText(msg.search.type.task, { exact: true })).toBeVisible()
    await expect(view.getByTestId('calendar-item-when')).toHaveText('Thu, Nov 12')
    await expect(view.getByText(msg.tasks.priority.high)).toBeVisible()
    await expect(page).toHaveURL(/\/calendar/)
    expect(await view.evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true)
    await view.getByRole('button', { name: msg.calendar.view.edit }).click()
    const editor = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await expect(editor).toBeVisible()
    await editor.getByRole('button', { name: msg.capture.save }).click()
    await expect(editor).toBeHidden()
    await expect(page).toHaveURL(/\/calendar/)
  })

  test('an event shows when, its reminder and formatted notes; Edit opens the event editor', async ({ page }) => {
    await open(page, '/calendar')
    await page.locator('.cal-event').filter({ hasText: 'Dinner' }).first().click()
    const view = page.getByTestId('calendar-item')
    await expect(view.getByTestId('calendar-item-when')).toHaveText('Fri, Nov 13 · 7:00 pm – 9:00 pm')
    await expect(view.getByText('1 hour before')).toBeVisible()
    await expect(view.getByTestId('calendar-item-notes').locator('em')).toHaveText('wine')
    await view.getByRole('button', { name: msg.calendar.view.edit }).click()
    await expect(page.getByRole('dialog', { name: msg.calendar.editor.heading })).toBeVisible()
  })
})

