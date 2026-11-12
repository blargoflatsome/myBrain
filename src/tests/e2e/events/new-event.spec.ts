import { expect, test, type Page } from '@playwright/test'
import { openSchedule } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

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

test.describe('Spec §5 Calendar: a new event starts at a time', () => {
  test('+ New event starts at the next whole hour for an hour; All day is a choice', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    await expect(dialog.getByRole('checkbox', { name: msg.availability.allDay })).not.toBeChecked()
    const start = dialog.getByLabel('Starts Time')
    await expect(start).toBeVisible()
    await dialog.getByLabel(msg.capture.titleLabel).fill('Play Star Wars')
    await dialog.getByLabel(msg.calendar.editor.repeat).selectOption({ label: 'Every 2 weeks' })
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('events')).toMatchObject({ title: 'Play Star Wars', start_time: '10:00', end_time: '11:00', repeat: 'biweekly' })
  })

  test('turning All day off fills in a time', async ({ page }) => {
    server.seed('events', [{ id: 'e1', title: 'Holiday', notes: null, start_date: '2026-11-10', start_time: null, end_date: '2026-11-10', end_time: null, repeat: 'never', reminder_minutes: null }])
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openSchedule(dialog)
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await expect(dialog.getByLabel('Starts Time')).not.toHaveValue('')
  })
})

