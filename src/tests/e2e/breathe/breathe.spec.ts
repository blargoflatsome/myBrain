import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isSafari } from '../support/devices'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

const NOW = new Date('2026-11-15T14:00:00Z')
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
})

const breatheWindow = (page: Page) => page.getByRole('dialog', { name: msg.breathe.heading })

test.describe('Spec §5 Breathe', { tag: '@phone' }, () => {
  test('opens from the header: 5 minutes, in then out with the ring, and ends with a closing line', async ({ page }) => {
    test.skip(isSafari(test.info()), 'fast-forwarding 5 minutes of quarter-second ticks is slow on WebKit; the same logic runs on Chrome')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    const open = page.getByTestId('breathe-open').locator('visible=true')
    await open.click()
    const win = breatheWindow(page)
    await expect(win.getByTestId('breathe-time')).toHaveText('05:00')
    await expect(win.getByTestId('breathe-word')).toHaveText(msg.breathe.in)
    await page.clock.runFor(4_500)
    await expect(win.getByTestId('breathe-word')).toHaveText(msg.breathe.out)
    await page.clock.runFor(6_000)
    await expect(win.getByTestId('breathe-word')).toHaveText(msg.breathe.in)
    await page.clock.runFor(5 * 60_000)
    await expect(win.getByTestId('breathe-done')).toHaveText(msg.breathe.done)
    await expect(win.getByTestId('breathe-time')).toHaveText('00:00')
    // Kept for its trophies (SPEC §5 Trophies, Breathing days).
    await expect.poll(() => server.written('activity_log').map((r) => r.kind)).toContain('breathe')
    await win.getByRole('button', { name: msg.breathe.finish, exact: true }).click()
    await expect(win).toBeHidden()
    await page.clock.runFor(10)
    await expect(open).toBeFocused()
  })

  test('opens over the Focus timer, which keeps going behind it', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('focus-open').locator('visible=true').click()
    const timer = page.getByRole('dialog', { name: msg.focus.menu })
    await timer.getByRole('button', { name: msg.breathe.open }).click()
    await expect(breatheWindow(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(breatheWindow(page)).toBeHidden()
    await expect(timer).toBeVisible()
  })
})
