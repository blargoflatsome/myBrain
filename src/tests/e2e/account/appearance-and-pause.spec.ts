import { expect, test } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §3 Visual style: Appearance', () => {
  test('choosing Dark applies at once, is saved to my profile, and is there straight away next visit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/account')
    await page.getByTestId('appearance-setting').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const darkBg = await bg()
    await expect.poll(() => server.profile.appearance).toBe('dark')

    await page.goto('/habits')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await bg()).toBe(darkBg)

    await page.goto('/account')
    await page.getByTestId('appearance-setting').selectOption('system')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    expect(await bg()).not.toBe(darkBg)
  })
})

test.describe('Spec §5 Habits: Pause all streaks', () => {
  test('turning it on pauses from today, and the Habits page says so', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-10T15:00:00Z') })
    server.seed('habits', [{ id: 'h1', title: 'Stretch', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' }])
    await page.goto('/account')
    await page.getByTestId('pause-streaks').check()
    await expect.poll(() => server.written('habit_pauses')[0]).toMatchObject({ start_date: '2026-11-10', end_date: null })
    await page.goto('/habits')
    await expect(page.getByTestId('habits-paused')).toHaveText(msg.habits.pausedLine)
  })
})
