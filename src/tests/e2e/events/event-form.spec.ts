import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Calendar: event form sections', () => {
  test('a new event opens with Schedule open (date, time, repeat, reminder); Attendees is folded with who is going first', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    const schedule = dialog.getByTestId('event-schedule')
    for (const name of ['All day', 'Starts Date', 'Ends Date', 'Repeat', 'Reminder']) await expect(schedule.getByLabel(name).first()).toBeVisible()
    await expect(dialog.getByTestId('event-more')).toHaveCount(0)
    const attendees = dialog.getByTestId('event-people')
    await expect(attendees).toContainText("Who's going, and inviting people")
    await expect(attendees.getByRole('button', { name: msg.invites.contacts })).toBeHidden()
    await attendees.locator('summary').click()
    await expect(attendees.getByRole('button', { name: msg.invites.contacts })).toBeVisible()
    await expect(attendees.getByRole('checkbox', { name: /Guests can see who’s going/ })).toBeVisible()
  })

  test('an existing event folds Schedule away, with when it is in the summary; invited people open Attendees', async ({ page }) => {
    server.seed('events', [{ id: 'e1', title: 'Lunch', notes: null, start_date: '2026-11-10', start_time: '12:30:00', end_date: '2026-11-10', end_time: '13:30:00', repeat: 'weekly', reminder_minutes: null }])
    server.rpcResults.event_people = [{ invite_id: 'inv-1', name: 'Pat', email: null, phone: '5550109000', response: 'yes', is_me: false }]
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    const schedule = dialog.getByTestId('event-schedule')
    await expect(schedule.locator('summary')).toContainText('Tue, Nov 10 · 12:30 pm – 1:30 pm, every week')
    await expect(schedule.getByLabel(msg.calendar.editor.repeat)).toBeHidden()
    const attendees = dialog.getByTestId('event-people')
    await expect(attendees.locator('summary')).toContainText('1 invited · 1 going')
    await expect(attendees.getByTestId('invited-person')).toContainText('Pat')
  })
})

