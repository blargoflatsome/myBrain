import { expect, test } from '@playwright/test'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

test.describe('Spec §8: Google sign-in through Supabase Auth', () => {
  test('SPEC §5 Home page: a signed-out visitor sees the home page at /, and app pages lead there', async ({ page }) => {
    await page.goto('/tasks')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: msg.home.heading, level: 1 })).toBeVisible()
    await expect(page.getByTestId('home-feature').first()).toBeVisible()
  })

  test('SPEC §8 404s: an address the app does not have shows Page not found, even signed out', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: msg.notFound.heading, level: 1 })).toBeVisible()
    await page.getByRole('link', { name: msg.notFound.home }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  // SPEC §5 Home page: Sign in (top) and Create a free account (opening section and the end) are both Google sign-in.
  for (const [button, nth] of [['home-sign-in', 0], ['home-create', 0], ['home-create', 1]] as const) {
    test(`the home page's ${button} button (${nth + 1}) starts the Google sign-in flow`, async ({ page }) => {
      await page.goto('/')
      const authorize = page.waitForRequest((req) => req.url().includes('/auth/v1/authorize'))
      await page.route('**/auth/v1/authorize**', (route) => route.fulfill({ status: 200, body: 'stubbed' }))
      await page.getByTestId(button).nth(nth).click()
      const req = await authorize
      expect(new URL(req.url()).searchParams.get('provider')).toBe('google')
    })
  }
})
