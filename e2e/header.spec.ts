import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// A 1×1 PNG, served as the Google profile picture.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const AVATAR = 'https://lh3.googleusercontent.com/a/test-picture'

async function open(page: Page, avatar: string | null, serve: 'ok' | 'broken' = 'ok') {
  const server = new FakeSupabase()
  server.setProfile({ avatar_url: avatar })
  await server.install(page)
  await page.route(`${AVATAR}*`, (route) => (serve === 'ok' ? route.fulfill({ contentType: 'image/png', body: PNG }) : route.fulfill({ status: 404 })))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  return page.getByTestId('app-header')
}

test.describe('Spec §2 Header: Account, Focus timer, alerts, Sign out and sync on every signed-in page', () => {
  test('the header has Account, Focus timer, the bell, Sign out and sync status, in that order', async ({ page }) => {
    const header = await open(page, null)
    const names = await header.locator('a[aria-label], button[aria-label], [role=status]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid') ?? e.getAttribute('aria-label')),
    )
    const order = ['header-account', 'focus-open', 'alerts-bell', 'header-sign-out', 'sync-indicator']
    expect(names.filter((n) => order.includes(n ?? ''))).toEqual(order)
    await expect(header.getByRole('link', { name: 'Account' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Focus timer' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(header.getByTestId('sync-indicator')).toHaveText('Synced')
  })

  test('Account shows my profile picture and opens the Account page', async ({ page }) => {
    const header = await open(page, AVATAR)
    await expect(header.getByTestId('header-avatar')).toBeVisible()
    expect(await header.getByTestId('header-avatar').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
    await header.getByRole('link', { name: 'Account' }).click()
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
    await expect(page.getByRole('dialog', { name: 'Focus timer' })).toBeVisible()
  })

  test('Sign out asks first: Stay signed in keeps me here, Sign out signs this device out', async ({ page }) => {
    const header = await open(page, null)
    await header.getByTestId('header-sign-out').click()
    const ask = page.getByRole('alertdialog', { name: 'Sign out?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Stay signed in' }).click()
    await expect(ask).toBeHidden()
    await expect(page).toHaveURL(/\/$/)

    await header.getByTestId('header-sign-out').click()
    await ask.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('Account and Focus timer are no longer under More', async ({ page }, info) => {
    await open(page, null)
    if (info.project.name === 'desktop-chromium') {
      await page.getByTestId('nav-more').click()
      const more = page.locator('#nav-more')
      await expect(more.getByRole('link', { name: 'Routines' })).toBeVisible()
      await expect(more.getByRole('link', { name: 'Account' })).toHaveCount(0)
      await expect(more.getByText('Focus timer')).toHaveCount(0)
    } else {
      await page.getByTestId('bottom-tabs').getByRole('button', { name: 'More' }).click()
      const sheet = page.getByTestId('more-sheet')
      await expect(sheet.getByRole('link', { name: 'Routines' })).toBeVisible()
      await expect(sheet.getByRole('link', { name: 'Account' })).toHaveCount(0)
      await expect(sheet.getByText('Focus timer')).toHaveCount(0)
    }
  })

  test('on phones, sync is the dot alone with its words for screen readers; wide screens show the words', async ({ page }, info) => {
    const header = await open(page, null)
    const sync = header.getByTestId('sync-indicator')
    await expect(sync).toHaveText('Synced')
    const words = sync.locator('span').nth(1)
    if (info.project.name === 'desktop-chromium') {
      await expect(words).not.toHaveClass(/sr-only/)
    } else {
      await expect(words).toHaveClass(/sr-only/)
      await expect(sync).toHaveAttribute('title', 'Synced')
      // Phones also keep My Brain and Search in the header.
      await expect(header.getByRole('link', { name: 'My Brain' })).toBeVisible()
      await expect(header.getByRole('button', { name: 'Search' })).toBeVisible()
    }
  })

  test('at 320 px the header fits without sideways scrolling, and every control is at least 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const header = await open(page, AVATAR)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    for (const el of await header.locator('a:visible, button:visible').all()) {
      const box = await el.boundingBox()
      expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      expect(box && box.x + box.width).toBeLessThanOrEqual(320)
    }
  })
})
