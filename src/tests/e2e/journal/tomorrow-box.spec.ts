import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

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

test.describe('Spec §5 Journal: the tomorrow box is the same size as the writing', () => {
  test('both boxes are the same height', async ({ page }) => {
    await open(page, '/journal')
    const write = page.getByRole('textbox', { name: msg.journal.writeLabel })
    const tomorrow = page.getByRole('textbox', { name: msg.journal.tomorrowLabel })
    await expect(tomorrow).toBeVisible()
    const [a, b] = [(await write.boundingBox())!, (await tomorrow.boundingBox())!]
    expect(Math.abs(a.height - b.height)).toBeLessThan(2)
  })
})

