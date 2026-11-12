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

test.describe('Spec §5 Quick capture: Habit', () => {
  test('capture can add a habit with the full habit form', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('group', { name: msg.capture.typeHeading }).getByRole('button', { name: msg.search.type.habit, exact: true }).click()
    await page.getByLabel(msg.capture.titleLabel, { exact: true }).fill('Floss')
    const days = page.getByRole('group', { name: msg.habits.editor.weekdays })
    await expect(days.getByRole('button', { pressed: true })).toHaveCount(7)
    await days.getByRole('button', { name: 'Sun' }).click()
    await howOften(page).getByRole('radio', { name: msg.howOften.biweekly }).click()
    await page.getByTestId('habit-reminders').locator('summary').click()
    await page.getByLabel(msg.habits.editor.notifyTime).fill('21:00')
    await page.getByRole('checkbox', { name: /Private/ }).check()
    await page.getByRole('button', { name: msg.capture.save, exact: true }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.habit)
    await expect.poll(() => lastWrite('habits')).toMatchObject({
      title: 'Floss',
      weekdays: [1, 2, 3, 4, 5, 6],
      week_interval: 2,
      notify_time: '21:00',
      is_private: true,
    })
  })
})

