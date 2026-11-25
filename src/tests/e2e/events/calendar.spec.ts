import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
import { expectFocused } from '../support/focus'
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
    server.seed('events', [
      { id: 'e1', title: 'Dentist', notes: null, start_date: '2026-11-10', start_time: '15:00:00', end_date: '2026-11-10', end_time: '16:00:00', repeat: 'never', reminder_minutes: 30 },
    ])
  }

  test('the calendar shows dated tasks and my events, in month, week and day views', async ({ page }) => {
    seedCalendar()
    await open(page, '/')
    await goTo(page, 'Calendar')
    for (const view of ['Month', 'Week', 'Day']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      const cal = page.locator('.cal-wrap')
      await expect(cal.getByText('Pay rent')).toBeVisible()
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

  // SPEC §5 Forms, When a save is refused: the field is marked, described by its message and focused.
  test('an event needs a title and must end after it starts; the refused field says why', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    const title = dialog.getByLabel(msg.capture.titleLabel)
    await title.fill('   ')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(title).toHaveAccessibleDescription(msg.forms.titleNeeded)
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expectFocused(title)
    // Changing the field takes the mark away.
    await title.fill('Oops')
    await expect(title).toHaveAttribute('aria-invalid', 'false')
    await expect(dialog.getByTestId('field-error')).toHaveCount(0)
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await dialog.getByLabel('Starts Time').fill('15:00')
    const end = dialog.getByLabel('Ends Time')
    await end.fill('14:00')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(end).toHaveAccessibleDescription(msg.calendar.editor.endError)
    await expectFocused(end)
    expect(server.written('events')).toHaveLength(0)
    // All day takes the time box away, and its message with it.
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).check()
    await expect(dialog.getByTestId('field-error')).toHaveCount(0)
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await end.fill('14:00')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(end).toHaveAttribute('aria-invalid', 'true')
    // Picking a time from the list changes the field too, so the mark goes. Phones use their own picker (no list).
    if (test.info().project.name === 'desktop-chromium') {
      await end.click()
      await dialog.getByRole('option', { name: '4:00 pm' }).click()
      await expect(end).toHaveAttribute('aria-invalid', 'false')
    }
  })

  test('tapping an event opens it; deleting a repeating event with no guests deletes the series, with Undo', async ({ page }) => {
    server.seed('events', [
      { id: 'e2', title: 'Standup', notes: null, start_date: '2026-11-02', start_time: '09:30:00', end_date: '2026-11-02', end_time: '09:45:00', repeat: 'weekdays', reminder_minutes: null },
    ])
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.availability.day, exact: true }).click()
    await page.locator('.cal-wrap').getByText('Standup').click()
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await expect(dialog.getByLabel(msg.capture.titleLabel)).toHaveValue('Standup')
    await dialog.getByRole('button', { name: msg.calendar.editor.delete }).click()
    await expect(page.getByTestId('undo-line')).toContainText(msg.undo.deleted('Standup'))
    await expect.poll(() => lastWrite('events')).toMatchObject({ id: 'e2', deleted_at: expect.any(String) })
    await expect(page.locator('.cal-wrap').getByText('Standup')).toHaveCount(0)
  })

  test('a reminder or search result can open the calendar on a day, with the event open', async ({ page }) => {
    seedCalendar()
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await expect(page.getByTestId('calendar-item').getByRole('heading', { name: 'Dentist' })).toBeVisible()
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    await expect(page.getByRole('dialog', { name: msg.calendar.editor.heading }).getByLabel(msg.capture.titleLabel)).toHaveValue('Dentist')
  })

  test('an alert’s link names only the event: it opens on the event’s own month; a link to another day moves an open calendar', async ({ page }) => {
    seedCalendar()
    server.seed('events', [
      { id: 'e9', title: 'Holiday party', notes: null, start_date: '2026-12-18', start_time: '18:00:00', end_date: '2026-12-18', end_time: '21:00:00', repeat: 'never', reminder_minutes: null },
    ])
    await open(page, '/calendar?event=e9')
    await expect(page.getByTestId('calendar-item').getByRole('heading', { name: 'Holiday party' })).toBeVisible()
    await expect(page.getByTestId('calendar-title')).toContainText('December')

    // A link to another day while the calendar is already open moves it there (here, a search result).
    await page.keyboard.press('Escape')
    const header = page.getByRole('banner').getByRole('button', { name: msg.nav.search })
    if (await header.isVisible()) await header.click()
    else await page.getByRole('navigation', { name: msg.nav.label }).getByRole('button', { name: msg.nav.search }).click()
    const search = page.getByRole('dialog', { name: msg.nav.search })
    await search.getByRole('searchbox', { name: msg.search.placeholder }).fill('Dentist')
    await search.getByTestId('search-result').click()
    await expect(page.getByTestId('calendar-title')).toContainText('November')
  })
})

