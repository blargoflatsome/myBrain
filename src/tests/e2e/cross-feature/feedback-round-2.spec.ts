import { expect, test, type Page } from '@playwright/test'
import { openAttendees } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
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

test.describe('Spec §5 Journal: save status, like Google Docs', () => {
  test('it says Saving… while there is writing waiting, then Saved', async ({ page }) => {
    await open(page, '/journal')
    const status = page.getByTestId('journal-today').getByTestId('save-status')
    await page.getByRole('textbox', { name: msg.journal.writeLabel }).click()
    await page.keyboard.type('A good day')
    // The clock is paused, so the save timer hasn't run: the writing is still waiting.
    await expect(status).toHaveText(msg.journal.saving)
    await page.getByRole('heading', { name: msg.nav.journal, level: 1 }).click()
    await expect(status).toHaveText(msg.journal.saved)
    await expect(status).toHaveAttribute('data-state', 'saved')
  })

  test('offline it says the writing is saved on this device and will sync later', async ({ page, context }) => {
    await open(page, '/journal')
    await expect(page.getByRole('textbox', { name: msg.journal.writeLabel })).toBeVisible()
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await page.getByRole('textbox', { name: msg.journal.writeLabel }).click()
    await page.keyboard.type('On the train')
    await page.getByRole('heading', { name: msg.nav.journal, level: 1 }).click()
    await expect(page.getByTestId('journal-today').getByTestId('save-status')).toHaveText(msg.journal.savedOnDevice)
    await context.setOffline(false)
  })
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
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
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
    await expect(page.getByTestId('page-position')).toHaveText(msg.pages.position(1, 2))
    await page.getByRole('navigation', { name: msg.quests.allHeading }).getByRole('button', { name: /Next/ }).click()
    await expect(titles).toHaveCount(2)
    await expect(titles).toHaveText(['Quest 04', 'Quest 08'])
    // The chosen filter is a soft tint with a check mark, not a solid green button.
    const any = page.getByRole('group', { name: /energy/i }).getByRole('button').first()
    await expect(any).toHaveAttribute('aria-pressed', 'true')
    // The check mark is drawn by .choice-on (SPEC §2 Calm by design: the same for every choice).
    expect(await any.evaluate((el) => getComputedStyle(el, '::before').content)).toContain('✓')
    await expect(any).not.toHaveClass(/(^| )bg-accent( |$)/)
  })
})

