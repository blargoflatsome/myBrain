import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
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

test.describe('Spec §5 Journal: save status, like Google Docs', () => {
  test('it says Saving… while there is writing waiting, then Saved', async ({ page }) => {
    await open(page, '/journal')
    const status = page.getByTestId('journal-today').getByTestId('save-status')
    await page.getByRole('textbox', { name: 'How the day went' }).click()
    await page.keyboard.type('A good day')
    // The clock is paused, so the save timer hasn't run: the writing is still waiting.
    await expect(status).toHaveText('Saving…')
    await page.getByRole('heading', { name: 'Journal', level: 1 }).click()
    await expect(status).toHaveText('Saved')
    await expect(status).toHaveAttribute('data-state', 'saved')
  })

  test('offline it says the writing is saved on this device and will sync later', async ({ page, context }) => {
    await open(page, '/journal')
    await expect(page.getByRole('textbox', { name: 'How the day went' })).toBeVisible()
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await page.getByRole('textbox', { name: 'How the day went' }).click()
    await page.keyboard.type('On the train')
    await page.getByRole('heading', { name: 'Journal', level: 1 }).click()
    await expect(page.getByTestId('journal-today').getByTestId('save-status')).toHaveText('Saved on this device, will sync when online')
    await context.setOffline(false)
  })
})

test.describe('Spec §5 Calendar: inviting shows what happened at every step', () => {
  const calendarEvent = { id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null }

  test('people picked from phone contacts are listed to invite; contacts without a phone or email are explained', async ({ page }) => {
    // Stand in for Android's contact picker.
    await page.addInitScript(() => {
      ;(window as unknown as { ContactsManager: unknown }).ContactsManager = function ContactsManager() {}
      Object.defineProperty(navigator, 'contacts', {
        value: { select: async () => [{ name: ['Erin'], tel: ['555 010 4000'] }, { name: ['No Number'] }] },
      })
    })
    server.seed('events', [calendarEvent])
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await expect(dialog.getByRole('heading', { name: 'To invite (when you save)' })).toBeVisible()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Erin/])
    await expect(dialog.getByTestId('people-status')).toHaveText('Added 1 person. 1 contact has no phone number or email. They’ll be invited when you save.')
  })

  test('after saving, a message says the invitations are ready, then how many were shared', async ({ page }) => {
    server.seed('events', [calendarEvent])
    server.rpcResults.invite_people = [
      { invite_id: 'inv-bob', name: 'Bob Baker', email: null, phone: null, token: null },
      { invite_id: 'inv-dan', name: 'Dan', email: null, phone: '5550103000', token: 'tok-dan' },
    ]
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await dialog.getByLabel('Email or phone number').fill('5550103000')
    await dialog.getByLabel('Their name (optional)').fill('Dan')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByTestId('people-status')).toHaveText('Added Dan. They’ll be invited when you save.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('invite-notice')).toHaveText('Invitations ready for 1 person. Send each one from the next window. 1 person uses My Brain and will see the invitation there.')
    const share = page.getByRole('dialog', { name: 'Let people know' })
    await share.getByRole('button', { name: 'Sent it, next' }).click()
    await share.getByRole('button', { name: 'All done' }).click()
    await expect(page.getByTestId('invite-notice')).toHaveText('Invitations shared with 1 person. They show as Not answered until they reply.')
  })
})

test.describe('Spec §5 Random Quest: calmer page, sorted by effort, in pages', () => {
  test('the list is easiest first, 10 per page, with page controls', async ({ page }) => {
    const levels = ['medicated', 'needs_setup', 'fun', 'ugh']
    server.seed(
      'quests',
      Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, title: `Quest ${String(i).padStart(2, '0')}`, energy_level: levels[i % 4], time_bucket: '30m', status: 'open' })),
    )
    await open(page, '/quests')
    const titles = page.getByTestId('quest-list').getByTestId('quest-title')
    await expect(titles).toHaveCount(10)
    await expect(titles.first()).toHaveText('Quest 03')
    await expect(page.getByTestId('page-position')).toHaveText('Page 1 of 2')
    await page.getByRole('navigation', { name: 'Your quests' }).getByRole('button', { name: /Next/ }).click()
    await expect(titles).toHaveCount(2)
    await expect(titles).toHaveText(['Quest 04', 'Quest 08'])
    // The chosen filter is a soft tint with a check mark, not a solid green button.
    const any = page.getByRole('group', { name: /energy/i }).getByRole('button').first()
    await expect(any).toHaveAttribute('aria-pressed', 'true')
    await expect(any).toContainText('✓')
    await expect(any).not.toHaveClass(/(^| )bg-accent( |$)/)
  })
})

test.describe('Spec §5 Dashboard: today’s notifications', () => {
  const note = (id: string, title: string, sent: string, date = '2026-11-10') => ({ id, kind: 'habit', item_id: null, title, body: 'Past you asked for this.', url: '/habits', local_date: date, sent_at: sent })

  test('lists only today’s, newest first, five per page; clear one or all', async ({ page }) => {
    server.seed('notifications', [
      ...Array.from({ length: 6 }, (_, i) => note(`n${i}`, `Reminder ${i}`, `2026-11-10T1${i}:00:00Z`)),
      note('old', 'Yesterday’s reminder', '2026-11-09T15:00:00Z', '2026-11-09'),
    ])
    await open(page, '/')
    const box = page.getByTestId('dash-notifications')
    await expect(box.getByRole('heading', { name: 'Today’s notifications' })).toBeVisible()
    await expect(box.getByTestId('notification')).toHaveCount(5)
    await expect(box.getByTestId('notification').first()).toContainText('Reminder 5')
    await expect(box).not.toContainText('Yesterday’s reminder')
    await expect(box.getByTestId('page-position')).toHaveText('Page 1 of 2')

    await box.getByRole('button', { name: 'Clear: Reminder 5' }).click()
    await expect.poll(() => lastWrite('notifications')).toMatchObject({ id: 'n5', deleted_at: expect.any(String) })
    await expect(box.getByTestId('notification')).toHaveCount(5)
    await expect(box.getByTestId('page-controls')).toHaveCount(0)

    await box.getByRole('button', { name: 'Clear all' }).click()
    await expect(box.getByTestId('notification')).toHaveCount(0)
    await expect(box).toContainText('Nothing from past you yet today.')
    await expect.poll(() => server.written('notifications').filter((n) => n.deleted_at).length).toBe(6)
  })

  test('tapping one opens what it is about', async ({ page }) => {
    server.seed('notifications', [note('n1', 'Take meds', '2026-11-10T13:00:00Z')])
    await open(page, '/')
    await page.getByTestId('dash-notifications').getByRole('link', { name: /Take meds/ }).click()
    await expect(page).toHaveURL(/\/habits$/)
  })
})
