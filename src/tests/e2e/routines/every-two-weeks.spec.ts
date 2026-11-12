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

const lastWrite = (table: string) => server.written(table).at(-1)

const howOften = (scope: Page | ReturnType<Page['getByRole']>) => scope.getByRole('radiogroup', { name: msg.forms.howOften })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Every week or every 2 weeks', () => {

  test('a routine on chosen weekdays can repeat every 2 weeks', async ({ page }) => {
    await open(page, '/routines')
    await page.getByRole('button', { name: /New routine/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(msg.capture.titleLabel, { exact: true }).fill('Deep clean')
    await dialog.getByRole('checkbox', { name: /Run anytime/ }).uncheck()
    await howOften(dialog).getByRole('radio', { name: msg.howOften.biweekly }).click()
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('routines')).toMatchObject({ title: 'Deep clean', week_interval: 2 })
  })
})
