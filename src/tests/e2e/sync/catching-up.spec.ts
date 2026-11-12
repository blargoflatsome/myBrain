import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-11T01:00:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §7 Catching up and not leaving changes behind', () => {
  async function setVisibility(page: Page, state: 'hidden' | 'visible') {
    await page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  }

  test('switching away saves writing still waiting on its timer, straight away', async ({ page }) => {
    await open(page, '/journal')
    const editor = page.getByRole('textbox', { name: msg.journal.writeLabel })
    await editor.click()
    await page.keyboard.type('Written on the bus')
    // The clock is paused, so the save timer never runs by itself: only leaving the app can save it.
    await setVisibility(page, 'hidden')
    await expect.poll(() => server.written('journal_entries').at(-1)?.body).toBe('<p>Written on the bus</p>')
  })

  test('coming back to the app pulls what changed on other devices', async ({ page }) => {
    await open(page, '/journal')
    await expect(page.getByText(msg.journal.empty)).toBeVisible()
    server.seed('journal_entries', [{ id: 'j-9', date: '2026-11-09', body: '<p>From my phone</p>', stats: {}, auto: false, stats_final: true, updated_at: '2026-11-11T00:59:00Z' }])
    await setVisibility(page, 'hidden')
    await setVisibility(page, 'visible')
    await expect(page.getByTestId('journal-entry-2026-11-09')).toContainText('From my phone')
  })
})

