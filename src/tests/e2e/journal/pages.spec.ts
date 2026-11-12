import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Journal: pages of 3 days, and a save status under each box', () => {
  test('Earlier entries show 3 days per page', async ({ page }) => {
    server.seed('journal_entries', ['01', '02', '03', '04', '05', '06', '07'].map((d) => ({ id: `j${d}`, date: `2026-11-${d}`, body: `<p>Day ${d}</p>`, stats: {}, auto: false, stats_final: true })))
    await open(page, '/journal')
    const entries = page.locator('[data-testid^="journal-entry-"]')
    await expect(entries).toHaveCount(3)
    await expect(entries.first()).toContainText('Day 07')
    await page.getByRole('navigation', { name: msg.journal.olderHeading }).getByRole('button', { name: /Next/ }).click()
    await expect(entries.first()).toContainText('Day 04')
    await expect(page.getByTestId('page-position')).toHaveText(msg.pages.position(2, 3))
  })

  test('the save status also sits right under the writing box and the tomorrow box', async ({ page }) => {
    await open(page, '/journal')
    const today = page.getByTestId('journal-today')
    await page.getByRole('textbox', { name: msg.journal.writeLabel }).click()
    await page.keyboard.type('A good day')
    await expect(today.getByTestId('save-status-writing')).toHaveText(msg.journal.saving)
    await page.getByRole('textbox', { name: msg.journal.tomorrowLabel }).click()
    await page.keyboard.type('Sleep early')
    await expect(today.getByTestId('save-status-tomorrow')).toHaveText(msg.journal.saving)
    await page.getByRole('heading', { name: msg.nav.journal, level: 1 }).click()
    await expect(today.getByTestId('save-status-writing')).toHaveText(msg.journal.saved)
    await expect(today.getByTestId('save-status-tomorrow')).toHaveText(msg.journal.saved)
  })
})

