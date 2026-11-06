import { expect, test } from '@playwright/test'

test.describe('Spec §3: mobile-first app shell', () => {
  test('home screen loads and shows the app name My Brain', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('My Brain')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Brain')
  })

  test('page never scrolls sideways at the current screen width', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
