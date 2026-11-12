import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

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

