import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isPhone } from '../support/devices'
import { goTo, openMore } from '../support/nav'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

async function open(page: Page, path = '/habits', time = NOW) {
  await page.clock.install({ time })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Navigation', { tag: '@phone' }, () => {
  test('the left menu reaches Dashboard, Tasks, Habits, Quests and Orphans (Account from the header), with text labels only', async ({ page }) => {
    await open(page, '/')
    for (const [name, url] of [
      ['Habits', /\/habits$/],
      ['Quests', /\/quests$/],
      ['Orphans', /\/orphans$/],
      ['Account', /\/account$/],
      ['Tasks', /\/tasks$/],
      ['Dashboard', /\/$/],
    ] as const) {
      await goTo(page, name)
      await expect(page).toHaveURL(url)
    }
    // The four main places, then everything else under More (SPEC §2 Navigation).
    const main = page.locator('nav[aria-label="Main"]:visible').getByRole('link')
    await expect(main.filter({ hasText: /^(Tasks|Habits|Calendar|The Vault)$/ })).toHaveText(['Tasks', 'Habits', 'Calendar', 'The Vault'])
    await openMore(page)
    const sheet = page.getByRole('dialog', { name: msg.nav.more })
    const moreLinks = (await sheet.isVisible()) ? sheet.getByRole('link') : page.locator('#nav-more').getByRole('link')
    await expect(moreLinks).toHaveText(['Routines', 'Journal', 'Quests', /^Orphans/, 'Connections', msg.nav.help])
  })

  test('on a phone, tabs along the bottom: Tasks, Habits, Calendar, The Vault and More; More opens the rest', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone-only behaviour')
    await open(page, '/')
    const tabs = page.getByTestId('bottom-tabs')
    await expect(tabs.getByRole('link')).toHaveText(['Tasks', 'Habits', 'Calendar', 'The Vault'])
    const box = await tabs.boundingBox()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual((page.viewportSize()?.height ?? 0) - 1)
    await tabs.getByRole('link', { name: msg.habits.heading }).click()
    await expect(page).toHaveURL(/\/habits$/)
    await expect(tabs.getByRole('link', { name: msg.habits.heading })).toHaveAttribute('aria-current', 'page')
    await tabs.getByRole('button', { name: /^More/ }).click()
    const sheet = page.getByRole('dialog', { name: msg.nav.more })
    await sheet.getByRole('link', { name: msg.nav.journal }).click()
    await expect(page).toHaveURL(/\/journal$/)
    await expect(sheet).toBeHidden()
    await expect(tabs.getByRole('button', { name: /^More/ })).toHaveAttribute('aria-current', 'page')
    // There's no Menu button any more.
    await expect(page.getByRole('button', { name: msg.nav.menu })).toHaveCount(0)
  })

  test('on a wider screen the menu is always shown on the left', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'desktop-only behaviour')
    await open(page, '/')
    await expect(page.getByTestId('bottom-tabs')).toBeHidden()
    const nav = page.locator('nav[aria-label="Main"]:visible')
    const box = await nav.boundingBox()
    expect(box?.x).toBe(0)
    // More opens the rest right there, and stays as I left it.
    const more = nav.getByRole('button', { name: /^More/ })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(page.locator('#nav-more').getByRole('link', { name: msg.nav.journal })).toBeVisible()
    await page.reload()
    await expect(page.locator('nav[aria-label="Main"]:visible').getByRole('button', { name: /^More/ })).toHaveAttribute('aria-expanded', 'true')
  })
})

