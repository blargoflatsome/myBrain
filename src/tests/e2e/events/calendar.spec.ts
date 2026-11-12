import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

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

test.describe('Spec §5 Calendar', { tag: '@phone' }, () => {
  function seedCalendar() {
    server.seed('tasks', [{ id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 3, status: 'open', source: 'manual' }])
    server.seed('priority_tasks', [{ id: 'p1', title: 'Insulin', reminder_time: '12:00:00', due_date: null, weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-01' }])
    server.seed('events', [
      { id: 'e1', title: 'Dentist', notes: null, start_date: '2026-11-10', start_time: '15:00:00', end_date: '2026-11-10', end_time: '16:00:00', repeat: 'never', reminder_minutes: 30 },
    ])
  }

  test('the calendar shows dated tasks, priority tasks and my events, in month, week and day views', async ({ page }) => {
    seedCalendar()
    await open(page, '/')
    await goTo(page, 'Calendar')
    for (const view of ['Month', 'Week', 'Day']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      const cal = page.locator('.cal-wrap')
      await expect(cal.getByText('Pay rent')).toBeVisible()
      await expect(cal.getByText('Insulin').first()).toBeVisible()
      await expect(cal.getByText('Dentist')).toBeVisible()
    }
    await expect(page.getByTestId('calendar-title')).toHaveText('November 10, 2026')
  })

  test('a new event is saved with its time, repeat and reminder', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    await dialog.getByLabel(msg.capture.titleLabel).fill('Team lunch')
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await dialog.getByLabel('Starts Time').fill('12:30')
    await dialog.getByLabel('Ends Time').fill('13:30')
    await dialog.getByLabel(msg.calendar.editor.repeat).selectOption({ label: 'Every week' })
    await dialog.getByLabel(msg.calendar.editor.reminder).selectOption({ label: '15 minutes before' })
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => lastWrite('events')).toMatchObject({
      title: 'Team lunch',
      start_date: '2026-11-10',
      start_time: '12:30',
      end_time: '13:30',
      repeat: 'weekly',
      reminder_minutes: 15,
    })
    await page.getByRole('button', { name: msg.availability.day, exact: true }).click()
    await expect(page.locator('.cal-wrap').getByText('Team lunch')).toBeVisible()
  })

  test('an event needs a title and must end after it starts', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog.getByRole('alert')).toHaveText(msg.calendar.editor.titleError)
    await dialog.getByLabel(msg.capture.titleLabel).fill('Oops')
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await dialog.getByLabel('Starts Time').fill('15:00')
    await dialog.getByLabel('Ends Time').fill('14:00')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog.getByRole('alert')).toHaveText(msg.calendar.editor.endError)
    expect(server.written('events')).toHaveLength(0)
  })

  test('tapping an event opens it; deleting a repeating event with no guests deletes the series, with Undo', async ({ page }) => {
    server.seed('events', [
      { id: 'e2', title: 'Standup', notes: null, start_date: '2026-11-02', start_time: '09:30:00', end_date: '2026-11-02', end_time: '09:45:00', repeat: 'weekdays', reminder_minutes: null },
    ])
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.availability.day, exact: true }).click()
    await page.locator('.cal-wrap').getByText('Standup').click()
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await expect(dialog.getByLabel(msg.capture.titleLabel)).toHaveValue('Standup')
    await dialog.getByRole('button', { name: msg.calendar.editor.delete }).click()
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.deleted('Standup'))
    await expect.poll(() => lastWrite('events')).toMatchObject({ id: 'e2', deleted_at: expect.any(String) })
    await expect(page.locator('.cal-wrap').getByText('Standup')).toHaveCount(0)
  })

  test('a reminder or search result can open the calendar on a day, with the event open', async ({ page }) => {
    seedCalendar()
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await expect(page.getByTestId('calendar-item').getByRole('heading', { name: 'Dentist' })).toBeVisible()
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
    await expect(page.getByRole('dialog', { name: msg.calendar.editor.heading }).getByLabel(msg.capture.titleLabel)).toHaveValue('Dentist')
  })
})

