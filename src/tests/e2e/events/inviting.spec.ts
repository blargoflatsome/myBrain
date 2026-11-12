import { expect, test, type Page } from '@playwright/test'
import { openAttendees } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Calendar: inviting shows what happened at every step', () => {
  const calendarEvent = { id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null }

  test('after saving, a message says the invitations are ready, then how many were shared', async ({ page }) => {
    server.seed('events', [calendarEvent])
    server.rpcResults.invite_people = [
      { invite_id: 'inv-bob', name: 'Bob Baker', email: null, phone: null, token: null },
      { invite_id: 'inv-dan', name: 'Dan', email: null, phone: '5550103000', token: 'tok-dan' },
    ]
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openAttendees(dialog)
    await dialog.getByLabel(msg.invites.contact).fill('5550103000')
    await dialog.getByLabel(msg.invites.contactName).fill('Dan')
    await dialog.getByRole('button', { name: msg.tasks.add, exact: true }).click()
    await expect(dialog.getByTestId('people-status')).toHaveText(msg.invites.added('Dan'))
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByTestId('invite-notice')).toHaveText('Invitations ready for 1 person. Send each one from the next window. 1 person uses My Brain and will see the invitation there.')
    const share = page.getByRole('dialog', { name: msg.share.heading })
    await share.getByRole('button', { name: msg.share.next }).click()
    await share.getByRole('button', { name: msg.share.done }).click()
    await expect(page.getByTestId('invite-notice')).toHaveText(msg.invites.shared(1, 1))
  })
})

