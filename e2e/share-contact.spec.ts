import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// The service worker stamps a shared contact file with the real time, so the page clock starts at the real time
// too (and is controlled from there). Event dates are worked out from that day in New York.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = Date.now()
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
let server: FakeSupabase

const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const event = (id: string, title: string, date: string, extra: Record<string, unknown> = {}) => ({
  id: `eeeeeeee-0000-4000-8000-00000000000${id}`,
  title,
  notes: null,
  start_date: date,
  start_time: '19:00:00',
  end_date: date,
  end_time: '21:00:00',
  repeat: 'never',
  reminder_minutes: null,
  cancelled_at: null,
  ...extra,
})
const vcard = (...lines: string[]) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n')
const ALLIE = vcard('FN:Allie Hannah', 'TEL;TYPE=CELL:(509) 434-8303')

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
})

/** Share into My Brain the way Android does: a POST to the share target, answered by the service worker. */
async function share(page: Page, fields: Record<string, string>, files: { name: string; type: string; text: string }[] = []) {
  await page.goto('/capture')
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.evaluate(
    ({ fields, files }) => {
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = '/share'
      form.enctype = 'multipart/form-data'
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input')
        input.name = name
        input.value = value
        form.append(input)
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.name = 'contacts'
      input.multiple = true
      const list = new DataTransfer()
      for (const f of files) list.items.add(new File([f.text], f.name, { type: f.type }))
      input.files = list.files
      form.append(input)
      document.body.append(form)
      form.submit()
    },
    { fields, files },
  )
}

test.describe('Spec §5 Calendar, sharing a contact into My Brain', () => {
  test('a shared contact opens "Invite … to", lists my upcoming events, and choosing one has them ready to invite', async ({ page }) => {
    server.seed('events', [
      event('1', 'Birthday party', day(3)),
      event('2', 'Last week', day(-7)),
      event('3', 'Called off', day(5), { cancelled_at: new Date(NOW).toISOString() }),
      event('4', 'Someone else’s', day(4), { user_id: OTHER_USER }),
      event('5', 'Book club', day(-30), { repeat: 'monthly' }),
    ])
    await share(page, { title: 'Allie Hannah' }, [{ name: 'Allie Hannah.vcf', type: 'text/x-vcard', text: ALLIE }])
    await expect(page).toHaveURL(/\/invite-contact$/)
    await expect(page.getByRole('heading', { name: 'Invite Allie Hannah to…', level: 1 })).toBeVisible()
    await expect(page.getByTestId('shared-person')).toHaveText(['Allie Hannah · (509) 434-8303'])
    // Mine, not cancelled, not over (or repeating); soonest first.
    await expect(page.getByTestId('share-event')).toHaveText([/^Book club/, /^Birthday party/])
    await page.getByTestId('share-event').filter({ hasText: 'Birthday party' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'To invite (when you save)' })).toBeVisible()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Allie Hannah/])
    expect(server.rpcCalls).not.toContain('invite_people')
    // The shared contact is used once: closing and opening the event again doesn't bring them back.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await page.locator('.cal-wrap').getByText('Birthday party').first().click()
    await expect(dialog.getByTestId('pending-person')).toHaveCount(0)
  })

  test('several contacts can go into a new event; contacts with no phone or email are counted', async ({ page }) => {
    const file = [ALLIE, vcard('FN:Frank', 'EMAIL:frank@example.com'), vcard('FN:No Number')].join('\r\n')
    await share(page, {}, [{ name: 'contacts.vcf', type: 'text/vcard', text: file }])
    await expect(page.getByRole('heading', { name: 'Invite 2 people to…', level: 1 })).toBeVisible()
    await expect(page.getByTestId('share-left-out')).toHaveText('1 contact has no phone number or email.')
    await expect(page.getByText('No upcoming events yet. Make a new one.')).toBeVisible()
    await page.getByRole('button', { name: 'New event' }).click()
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Allie Hannah/, /^Frank/])
  })

  test('shared text and links still go to Capture', async ({ page }) => {
    await share(page, { title: 'Great recipe', text: 'https://example.com/soup' })
    await expect(page.getByTestId('shared-text')).toHaveText('Great recipe\nhttps://example.com/soup')
  })

  test('a contact file with no phone or email says there is no one to invite', async ({ page }) => {
    await share(page, {}, [{ name: 'x.vcf', type: 'text/vcard', text: vcard('FN:No Number') }])
    await expect(page.getByTestId('share-problem')).toHaveText('That contact has no phone number or email, so there’s no one to invite.')
    await expect(page.getByRole('link', { name: 'Go to the Calendar' })).toBeVisible()
  })

  test('opening the screen with nothing shared says so; a share is only read once', async ({ page }) => {
    await share(page, {}, [{ name: 'Allie.vcf', type: 'text/x-vcard', text: ALLIE }])
    await expect(page.getByTestId('shared-person')).toHaveCount(1)
    await page.reload()
    await expect(page.getByTestId('share-problem')).toHaveText(
      'Nothing was shared. To invite someone from your contacts, share their contact to My Brain from your Contacts app.',
    )
  })

  test('a long name, a long email and a long event title fit at 320 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    const long = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'
    server.seed('events', [event('1', long, day(2))])
    const file = vcard(`FN:${long}`, 'EMAIL:areallylongemailaddressthatsomeonetypedwithoutanybreaksatall@example.com')
    await share(page, {}, [{ name: 'long.vcf', type: 'text/vcard', text: file }])
    await expect(page.getByTestId('shared-person')).toHaveCount(1)
    await expect(page.getByTestId('share-event')).toHaveCount(1)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
