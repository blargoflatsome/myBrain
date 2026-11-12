import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'

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

test.describe('Spec §8 Delete my data: an orange warning, not red', () => {
  test('its button uses the warning colour; Delete My Account stays red', async ({ page }) => {
    await open(page, '/account')
    const wipe = page.getByTestId('delete-data').getByRole('button')
    const account = page.getByTestId('delete-account').getByRole('button')
    await expect(wipe).toBeVisible()
    const [wipeColor, accountColor] = await Promise.all([wipe.evaluate((b) => getComputedStyle(b).color), account.evaluate((b) => getComputedStyle(b).color)])
    expect(wipeColor).not.toBe(accountColor)
    const [r, g, b] = wipeColor.match(/\d+/g)!.map(Number)
    expect(r).toBeGreaterThan(g!) // orange: lots of red, some green, little blue
    expect(g).toBeGreaterThan(b!)
  })
})

