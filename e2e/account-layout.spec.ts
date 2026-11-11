import { expect, test } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

test.describe('Spec §5 Account page: grouped into sections that open and close', () => {
  test('only Your profile starts open; the others open with a tap and stay as I left them', async ({ page }) => {
    const server = new FakeSupabase()
    server.openAccountGroups = false
    await server.install(page)
    await page.goto('/account')
    for (const [id, name] of [
      ['profile', 'Your profile'],
      ['reminders', 'Reminders'],
      ['events', 'Events'],
      ['people', 'People'],
      ['data', 'Your data'],
      ['account', 'Account'],
    ] as const) {
      await expect(page.getByTestId(`account-group-${id}`).getByRole('heading', { name, level: 2 })).toBeVisible()
    }
    await expect(page.getByLabel('Display name')).toBeVisible()
    await expect(page.getByTestId('event-settings')).toBeHidden()
    await expect(page.getByTestId('delete-account')).toBeHidden()

    // Open Events: settings and availability are both there; it stays open after a reload.
    await page.getByTestId('account-group-events').locator('summary').click()
    await expect(page.getByTestId('event-settings')).toBeVisible()
    await expect(page.getByTestId('availability')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('event-settings')).toBeVisible()

    // Groups work from the keyboard (Enter on the summary).
    await page.getByTestId('account-group-account').locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('delete-account')).toBeVisible()
  })

  test('on a wide screen, things sit side by side', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'wide screens only')
    const server = new FakeSupabase()
    await server.install(page)
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto('/account')
    const a = await page.getByTestId('event-settings').boundingBox()
    const b = await page.getByTestId('availability').boundingBox()
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(2)
    expect((b?.x ?? 0) > (a?.x ?? 0)).toBe(true)
  })
})

test.describe('Spec §5 Account page: Sign out right under Your profile', () => {
  test('Sign out is visible with every group closed, right after Your profile and away from Delete account', async ({ page }) => {
    const server = new FakeSupabase()
    server.openAccountGroups = false
    await server.install(page)
    await page.goto('/account')
    const signOut = page.getByTestId('sign-out')
    await expect(signOut.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await page.getByTestId('account-group-account').locator('summary').click()
    await expect(page.getByTestId('account-group-account').getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    // It comes straight after the Your profile group.
    const next = await page.getByTestId('account-group-profile').evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'))
    expect(next).toBe('sign-out')
    await signOut.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})
