import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isSafari } from '../support/devices'
import { goTo } from '../support/nav'
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

test.describe('Spec §5 Focus timer', { tag: '@phone' }, () => {
  async function openTimer(page: Page) {
    await page.getByTestId('focus-open').locator('visible=true').click()
    return page.getByRole('dialog', { name: msg.focus.menu })
  }

  test('full screen: the time counting down and what to do; it moves on to a short break', async ({ page }) => {
    test.skip(isSafari(test.info()), 'fast-forwarding many minutes takes over a minute on WebKit; the same logic runs on Chrome')
    await open(page, '/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    const timer = await openTimer(page)
    await expect(timer.getByTestId('focus-phase')).toHaveText(msg.focus.phase.work)
    await expect(timer.getByTestId('focus-time')).toHaveText('25:00')
    await expect(timer.getByTestId('focus-round')).toHaveText(msg.focus.round(1))
    await page.clock.runFor(60_000)
    await expect(timer.getByTestId('focus-time')).toHaveText('24:00')
    await page.clock.runFor(24 * 60_000 + 1000)
    await expect(timer.getByTestId('focus-phase')).toHaveText(msg.focus.phase.short)
    await expect(timer.getByTestId('focus-time')).toHaveText(/^04:5\d$/)
  })

  test('minimize keeps it going as a pill on every page; tapping the pill opens it again; ✕ stops it', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    const timer = await openTimer(page)
    await timer.getByRole('button', { name: msg.focus.minimize }).click()
    await expect(timer).toHaveCount(0)
    const pill = page.getByTestId('focus-pill')
    await expect(pill).toContainText(/Work · (25:00|24:5\d)/)
    await page.clock.runFor(2 * 60_000)
    await page.reload()
    await expect(page.getByTestId('focus-pill')).toContainText(/Work · 2[23]:\d\d/)
    await goTo(page, 'Habits')
    await page.getByTestId('focus-pill').click()
    const again = page.getByRole('dialog', { name: msg.focus.menu })
    await expect(again).toBeVisible()
    await again.getByRole('button', { name: msg.focus.close }).click()
    await expect(again).toHaveCount(0)
    await expect(page.getByTestId('focus-pill')).toHaveCount(0)
  })

  test('pause holds the time; skip moves to the next part', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    const timer = await openTimer(page)
    await timer.getByRole('button', { name: msg.focus.pause }).click()
    await page.clock.runFor(5 * 60_000)
    await expect(timer.getByTestId('focus-time')).toHaveText('25:00')
    await timer.getByRole('button', { name: msg.focus.resume }).click()
    await timer.getByRole('button', { name: msg.share.skip }).click()
    await expect(timer.getByTestId('focus-phase')).toHaveText(msg.focus.phase.short)
    await expect(timer.getByTestId('focus-time')).toHaveText('05:00')
  })
})

