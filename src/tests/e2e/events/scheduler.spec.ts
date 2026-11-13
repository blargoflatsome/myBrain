import { expect, test, type Locator, type Page } from '@playwright/test'
import { openAttendees, openSchedule } from '../support/events'
import { FakeSupabase, TEST_USER_ID } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// SPEC §10 Connections, Scheduler. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002'
let server: FakeSupabase

const shares = (user_id: string) => ({ user_id, timezone: 'America/New_York', kind: 'shares', weekday: null, start_date: null, start_time: null, end_date: null, end_time: null, repeat: null, busy: false, level: null })
// Bob is not available Tuesdays, 6 pm to 11 pm.
const bobTuesdayEvenings = { ...shares(BOB), kind: 'rule', weekday: 2, start_time: '18:00:00', end_time: '23:00:00', busy: true, level: 'busy' }
const calendarEvent = (extra: Record<string, unknown> = {}) => ({
  id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null,
  ...extra,
})
const rpc = (name: string) => server.rpcArgs.filter((c) => c.name === name)

async function editEvent(page: Page, date = '2026-11-10'): Promise<Locator> {
  await page.clock.install({ time: NOW })
  await page.goto(`/calendar?date=${date}&event=${EVENT}`)
  await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
  return page.getByRole('dialog', { name: msg.calendar.editor.heading })
}
async function addBob(page: Page, dialog: Locator) {
  await openAttendees(dialog)
  await dialog.getByRole('button', { name: msg.invites.contacts }).click()
  const contacts = page.getByRole('dialog', { name: msg.contacts.heading })
  await contacts.getByRole('button', { name: 'Add Bob Baker' }).click()
  await contacts.getByRole('button', { name: msg.calendar.view.done }).click()
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  server.rpcResults.my_connections = [{ friend_id: BOB, display_name: 'Bob Baker', avatar_url: null, since: '2026-11-01T00:00:00Z' }]
})

test.describe('SPEC §10 Scheduler: who is free, and Find a time', () => {
  test('a connection I add shows busy for the time; Find a time lists Good times first and picking one fills it in', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.free_busy = [shares(BOB), shares(TEST_USER_ID), bobTuesdayEvenings]
    const dialog = await editEvent(page)
    await addBob(page, dialog)
    await expect(dialog.getByTestId('person-availability')).toHaveText(new RegExp(msg.invites.status.busy))
    await openSchedule(dialog)
    await expect(dialog.getByTestId('who-is-free')).toContainText(msg.invites.summary(0, 1))
    await dialog.getByTestId('find-a-time-button').click()
    const times = dialog.getByTestId('suggested-time')
    await expect(times).toHaveCount(5)
    await expect(times.first()).toHaveAttribute('data-rating', 'good')
    await times.first().click()
    await expect(dialog.getByTestId('person-availability')).toHaveText(new RegExp(msg.invites.status.free))
    await expect(dialog.getByTestId('who-is-free')).toContainText(msg.invites.summary(1, 1))
  })

  test('an event weeks away is checked against that week, not just the next two weeks', async ({ page }) => {
    // Tuesday Dec 15, 7 pm: Bob's Tuesday evenings still count.
    server.seed('events', [calendarEvent({ start_date: '2026-12-15', end_date: '2026-12-15' })])
    server.rpcResults.free_busy = [shares(BOB), shares(TEST_USER_ID), bobTuesdayEvenings]
    const dialog = await editEvent(page, '2026-12-15')
    await addBob(page, dialog)
    await expect(dialog.getByTestId('person-availability')).toHaveText(new RegExp(msg.invites.status.busy))
  })

  test('someone whose times aren’t shared is unknown, never free', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.free_busy = [shares(TEST_USER_ID)]
    const dialog = await editEvent(page)
    await addBob(page, dialog)
    await expect(dialog.getByTestId('person-availability')).toHaveText(new RegExp(msg.invites.status.unknown))
  })

  test('connections already invited are checked too, and marking one optional is saved straight away', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.free_busy = [shares(BOB), shares(TEST_USER_ID), bobTuesdayEvenings]
    server.rpcResults.event_people = [{ invite_id: 'inv-bob', name: 'Bob Baker', email: null, phone: null, response: 'pending', is_me: false, user_id: BOB, optional: false }]
    const dialog = await editEvent(page)
    await openAttendees(dialog)
    const bob = dialog.getByTestId('invited-person')
    await expect(bob.getByTestId('person-availability')).toHaveText(new RegExp(msg.invites.status.busy))
    await bob.getByRole('checkbox', { name: msg.invites.optionalLabel('Bob Baker') }).check()
    await expect.poll(() => rpc('set_invite_optional')[0]?.args).toEqual({ invite: 'inv-bob', value: true })
  })

  test('Show me as is saved with the event', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    const dialog = await editEvent(page)
    await openSchedule(dialog)
    const showAs = dialog.getByTestId('event-show-as')
    await expect(showAs.getByRole('button', { name: msg.calendar.editor.showAsOptions.busy })).toHaveAttribute('aria-pressed', 'true')
    await showAs.getByRole('button', { name: msg.calendar.editor.showAsOptions.free }).click()
    await dialog.getByRole('button', { name: msg.calendar.editor.save }).click()
    await expect.poll(() => server.written('events').at(-1)).toMatchObject({ id: EVENT, show_as: 'free' })
  })
})

test.describe('SPEC §10 Scheduler: my availability on the Calendar', () => {
  test('My availability opens from the Calendar; Work hours adds the same times on each chosen day; Week view shades them', async ({ page }) => {
    await page.clock.install({ time: NOW })
    await page.goto('/calendar?date=2026-11-10')
    await page.getByTestId('open-availability').click()
    const box = page.getByRole('dialog', { name: msg.availability.open })
    await box.getByTestId('add-work-hours').click()
    await box.getByTestId('work-hours').getByRole('button', { name: msg.availability.addWorkHours }).click()
    await expect(box.getByTestId('availability-rule')).toHaveCount(5)
    await expect.poll(() => server.written('availability_rules').map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5])
    expect(server.written('availability_rules')[0]).toMatchObject({ start_time: '09:00', end_time: '17:00' })
    await box.getByTestId('close-x').click()

    await page.getByRole('button', { name: msg.calendar.views.week }).click()
    await expect(page.getByTestId('unavailable-key')).toBeVisible()
    await expect(page.locator('.cal-wrap .unavailable')).toHaveCount(5)
  })
})
