import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// A 1×1 PNG, served as the Google profile picture.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const AVATAR = 'https://lh3.googleusercontent.com/a/test-picture'

async function open(page: Page, avatar: string | null, serve: 'ok' | 'broken' = 'ok') {
  const server = new FakeSupabase()
  server.setProfile({ avatar_url: avatar })
  await server.install(page)
  await page.route(`${AVATAR}*`, (route) => (serve === 'ok' ? route.fulfill({ contentType: 'image/png', body: PNG }) : route.fulfill({ status: 404 })))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
  return page.getByTestId('app-header')
}

test.describe('Spec §2 Header: Account, Focus timer, alerts and sync on every signed-in page', () => {
  test('the header has Account, Focus timer, the bell and sync status, in that order, and no Sign out', async ({ page }) => {
    const header = await open(page, null)
    const names = await header.locator('a[aria-label], button[aria-label], [role=status]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid') ?? e.getAttribute('aria-label')),
    )
    const order = ['header-account', 'focus-open', 'alerts-bell', 'sync-indicator']
    expect(names.filter((n) => order.includes(n ?? ''))).toEqual(order)
    await expect(header.getByRole('link', { name: msg.header.account })).toBeVisible()
    await expect(header.getByRole('button', { name: msg.focus.menu })).toBeVisible()
    await expect(header.getByRole('button', { name: msg.signOut.button })).toHaveCount(0)
    await expect(header.getByTestId('sync-indicator')).toHaveText(msg.sync.online)
  })

  test('Account shows my profile picture and opens the Account page', async ({ page }) => {
    const header = await open(page, AVATAR)
    await expect(header.getByTestId('header-avatar')).toBeVisible()
    expect(await header.getByTestId('header-avatar').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
    await header.getByRole('link', { name: msg.header.account }).click()
    await expect(page).toHaveURL(/\/account$/)
  })

  test('Account shows a plain person icon when I have no picture', async ({ page }) => {
    const header = await open(page, null)
    await expect(header.getByTestId('header-avatar')).toHaveCount(0)
    await expect(header.getByTestId('header-account').locator('[data-icon="user"]')).toBeVisible()
  })

  test("Account falls back to the person icon when the picture can't load", async ({ page }) => {
    const header = await open(page, AVATAR, 'broken')
    await expect(header.getByTestId('header-account').locator('[data-icon="user"]')).toBeVisible()
    await expect(header.getByTestId('header-avatar')).toHaveCount(0)
  })

  test('the stopwatch button opens the Focus timer', async ({ page }) => {
    const header = await open(page, null)
    await expect(header.getByTestId('focus-open').locator('[data-icon="timer"]')).toBeVisible()
    await header.getByTestId('focus-open').click()
    await expect(page.getByRole('dialog', { name: msg.focus.menu })).toBeVisible()
  })

  test('Account and Focus timer are no longer under More', async ({ page }, info) => {
    await open(page, null)
    if (info.project.name === 'desktop-chromium') {
      await page.getByTestId('nav-more').click()
      const more = page.locator('#nav-more')
      await expect(more.getByRole('link', { name: msg.nav.routines })).toBeVisible()
      await expect(more.getByRole('link', { name: msg.header.account })).toHaveCount(0)
      await expect(more.getByText(msg.focus.menu)).toHaveCount(0)
    } else {
      await page.getByTestId('bottom-tabs').getByRole('button', { name: msg.nav.more }).click()
      const sheet = page.getByTestId('more-sheet')
      await expect(sheet.getByRole('link', { name: msg.nav.routines })).toBeVisible()
      await expect(sheet.getByRole('link', { name: msg.header.account })).toHaveCount(0)
      await expect(sheet.getByText(msg.focus.menu)).toHaveCount(0)
    }
  })

  test('on phones, sync is the dot alone with its words for screen readers; wide screens show the words', async ({ page }, info) => {
    const header = await open(page, null)
    const sync = header.getByTestId('sync-indicator')
    await expect(sync).toHaveText(msg.sync.online)
    const words = sync.locator('span').nth(1)
    if (info.project.name === 'desktop-chromium') {
      await expect(words).not.toHaveClass(/sr-only/)
    } else {
      await expect(words).toHaveClass(/sr-only/)
      await expect(sync).toHaveAttribute('title', 'Synced')
      // Phones also have a Home icon (named My Brain, opens the Dashboard) and Search in the header.
      const home = header.getByRole('link', { name: msg.appName })
      await expect(home.locator('[data-icon="home"]')).toBeVisible()
      await expect(home).not.toContainText(msg.appName)
      await expect(header.getByRole('button', { name: msg.nav.search })).toBeVisible()
    }
  })

  for (const [width, size] of [[320, 40], [360, 44], [412, 44]] as const) {
    test(`at ${width} px everything sits on one line without sideways scrolling, controls ${size} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 })
      const header = await open(page, AVATAR)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const controls = await header.locator('a:visible, button:visible, [role=status]').all()
      expect(controls).toHaveLength(6)
      const middles: number[] = []
      for (const el of controls) {
        const box = (await el.boundingBox())!
        if ((await el.getAttribute('role')) !== 'status') expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(size)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        middles.push(box.y + box.height / 2)
      }
      expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(2)
    })
  }

  test('the Home icon opens the Dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const header = await open(page, null)
    await header.getByRole('link', { name: msg.header.account }).click()
    await expect(page).toHaveURL(/\/account$/)
    await header.getByTestId('header-home').click()
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
  })
})
