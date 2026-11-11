import { expect, test } from '@playwright/test'

test.describe('Spec §8: Google sign-in through Supabase Auth', () => {
  test('a signed-out visitor opening the app is sent to sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  })

  test('the Sign in with Google button starts the Google sign-in flow', async ({ page }) => {
    await page.goto('/sign-in')
    const authorize = page.waitForRequest((req) => req.url().includes('/auth/v1/authorize'))
    await page.route('**/auth/v1/authorize**', (route) => route.fulfill({ status: 200, body: 'stubbed' }))
    await page.getByRole('button', { name: 'Sign in with Google' }).click()
    const req = await authorize
    expect(new URL(req.url()).searchParams.get('provider')).toBe('google')
  })
})
