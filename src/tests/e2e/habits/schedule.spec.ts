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

const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Habits: start date and how often', { tag: '@phone' }, () => {
  test('Recycling: every other Thursday from Nov 12, reminder at 3 pm', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
    await dialog.getByLabel(msg.capture.titleLabel).fill('Recycling')
    await dialog.getByLabel(msg.habits.editor.startDate).fill('2026-11-12')
    await dialog.getByRole('radiogroup', { name: msg.forms.howOften }).getByRole('radio', { name: msg.howOften.biweekly }).click()
    const days = dialog.getByRole('group', { name: msg.habits.editor.weekdays })
    for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Fri', 'Sat']) await days.getByRole('button', { name: d }).click()
    await dialog.getByTestId('habit-reminders').locator('summary').click()
    await dialog.getByLabel(msg.habits.editor.notifyTime).fill('15:00')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('habits')).toMatchObject({ title: 'Recycling', start_date: '2026-11-12', week_interval: 2, weekdays: [4], notify_time: '15:00', monthly: false })
  })

  test('every month on the start date’s day: the weekdays go away', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
    await dialog.getByLabel(msg.capture.titleLabel).fill('Pay rent')
    await dialog.getByLabel(msg.habits.editor.startDate).fill('2026-12-01')
    await dialog.getByRole('radio', { name: 'Every month on the 1st' }).click()
    await expect(dialog.getByRole('group', { name: msg.habits.editor.weekdays })).toHaveCount(0)
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('habits')).toMatchObject({ title: 'Pay rent', start_date: '2026-12-01', monthly: true })
  })

  test('a habit can’t start before today', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    await expect(page.getByRole('dialog', { name: msg.habits.editor.newHeading }).getByLabel(msg.habits.editor.startDate)).toHaveAttribute(test.info().project.name === 'desktop-chromium' ? 'data-min' : 'min', '2026-11-10')
  })
})

