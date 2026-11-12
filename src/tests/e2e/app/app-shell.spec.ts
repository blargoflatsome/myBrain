import { expect, test } from '@playwright/test'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

test.describe('Spec §8: Google sign-in through Supabase Auth', () => {
  test('a signed-out visitor opening the app is sent to sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('button', { name: msg.signIn.button })).toBeVisible()
  })

  test('SPEC §8 404s: an address the app does not have shows Page not found, even signed out', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: msg.notFound.heading, level: 1 })).toBeVisible()
    await page.getByRole('link', { name: msg.notFound.home }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('the Sign in with Google button starts the Google sign-in flow', async ({ page }) => {
    await page.goto('/sign-in')
    const authorize = page.waitForRequest((req) => req.url().includes('/auth/v1/authorize'))
    await page.route('**/auth/v1/authorize**', (route) => route.fulfill({ status: 200, body: 'stubbed' }))
    await page.getByRole('button', { name: msg.signIn.button }).click()
    const req = await authorize
    expect(new URL(req.url()).searchParams.get('provider')).toBe('google')
  })
})
