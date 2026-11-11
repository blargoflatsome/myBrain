import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
let server: FakeSupabase
const note = (id: string, title: string, sent: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'habit',
  item_id: null,
  title,
  body: 'Past you asked for this.',
  url: '/habits',
  local_date: sent.slice(0, 10),
  sent_at: sent,
  read_at: null,
  ...extra,
})
async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §6 In-app alerts: the bell', () => {
  test('the bell shows how many alerts I haven’t dealt with; it lists the last 7 days, newest first, 5 per page', async ({ page }) => {
    server.seed('notifications', [
      ...Array.from({ length: 6 }, (_, i) => note(`n${i}`, `Reminder ${i}`, `2026-11-10T0${i}:00:00Z`)),
      note('seen', 'Seen already', '2026-11-08T15:00:00Z', { read_at: '2026-11-08T16:00:00Z' }),
      note('old', 'Too old', '2026-11-01T15:00:00Z'),
    ])
    await open(page, '/tasks')
    const bell = page.getByTestId('alerts-bell').first()
    await expect(bell).toHaveAccessibleName('Alerts, 6 new')
    await expect(page.getByTestId('alerts-count').first()).toHaveText('6')
    await bell.click()
    const list = page.getByRole('dialog', { name: 'Alerts' })
    await expect(list.getByTestId('alert')).toHaveCount(5)
    await expect(list.getByTestId('alert').first()).toContainText('Reminder 5')
    await expect(list.getByTestId('alert').first()).toContainText('New')
    await expect(list.getByTestId('page-position')).toHaveText('Page 1 of 2')
    await list.getByRole('navigation', { name: 'Alerts' }).getByRole('button', { name: /Next/ }).click()
    await expect(list.getByTestId('alert')).toHaveText([/Reminder 0/, /Seen already/])
    await expect(list).not.toContainText('Too old')
  })

  test('tapping an alert goes where I deal with it and counts it as seen (one at a time)', async ({ page }) => {
    server.seed('notifications', [note('n1', 'Take meds', '2026-11-10T13:00:00Z'), note('n2', 'Stretch', '2026-11-10T12:00:00Z')])
    await open(page, '/tasks')
    await page.getByTestId('alerts-bell').first().click()
    await page.getByRole('dialog', { name: 'Alerts' }).getByRole('button', { name: /^New Take meds/ }).click()
    await expect(page).toHaveURL(/\/habits$/)
    await expect.poll(() => lastWrite('notifications')).toMatchObject({ id: 'n1', read_at: expect.any(String) })
    await expect(page.getByTestId('alerts-bell').first()).toHaveAccessibleName('Alerts, 1 new')
  })

  test('✕ clears one and Clear all clears them all; with none the count is hidden', async ({ page }) => {
    server.seed('notifications', [note('n1', 'Take meds', '2026-11-10T13:00:00Z'), note('n2', 'Stretch', '2026-11-10T12:00:00Z')])
    await open(page, '/tasks')
    await page.getByTestId('alerts-bell').first().click()
    const list = page.getByRole('dialog', { name: 'Alerts' })
    await list.getByRole('button', { name: 'Clear: Take meds' }).click()
    await expect(list.getByTestId('alert')).toHaveCount(1)
    await list.getByRole('button', { name: 'Clear all' }).click()
    await expect(list).toContainText('Nothing from past you in the last 7 days.')
    await expect.poll(() => server.written('notifications').filter((n) => n.deleted_at).length).toBe(2)
    await list.getByRole('button', { name: 'Close' }).first().click()
    await expect(page.getByTestId('alerts-count')).toHaveCount(0)
  })
})

test.describe('Spec §6 In-app alerts: the banner', () => {
  test('a new alert while the app is open slides in at the top, and hides after 8 seconds', async ({ page }) => {
    server.seed('notifications', [note('old', 'Already here', '2026-11-10T13:00:00Z')])
    await open(page, '/tasks')
    await expect(page.getByTestId('alerts-bell').first()).toHaveAccessibleName('Alerts, 1 new')
    // Alerts already there when the app opened don't pop up.
    await expect(page.getByTestId('alert-banner')).toHaveCount(0)

    server.seed('notifications', [note('n2', 'Dev Bob wants to connect', '2026-11-10T14:00:00Z', { kind: 'connection_request', url: '/connections', body: 'Open Connections to answer.' })])
    // The app syncs when it comes back into view.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    const banner = page.getByTestId('alert-banner')
    await expect(banner).toContainText('Dev Bob wants to connect')
    await page.clock.runFor(8500)
    await expect(banner).toHaveCount(0)
  })

  test('tapping the banner goes where I deal with it and counts it as seen', async ({ page }) => {
    server.seed('notifications', [note('old', 'Already here', '2026-11-10T13:00:00Z')])
    await open(page, '/tasks')
    await expect(page.getByTestId('alerts-bell').first()).toHaveAccessibleName('Alerts, 1 new')
    server.seed('notifications', [note('n2', 'Dev Bob wants to connect', '2026-11-10T14:00:00Z', { kind: 'connection_request', url: '/connections' })])
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.getByTestId('alert-banner').getByRole('button', { name: /Dev Bob wants to connect/ }).click()
    await expect(page).toHaveURL(/\/connections$/)
    await expect.poll(() => lastWrite('notifications')).toMatchObject({ id: 'n2', read_at: expect.any(String) })
  })
})
