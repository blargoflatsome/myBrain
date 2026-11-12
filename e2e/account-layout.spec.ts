import { expect, test } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

test.describe('Spec §5 Account page: grouped into sections that open and close', () => {
  test('only Your profile starts open; Account Settings holds the other groups, which open with a tap and stay as I left them', async ({ page }) => {
    const server = new FakeSupabase()
    server.openAccountGroups = false
    await server.install(page)
    await page.goto('/account')
    await expect(page.getByTestId('account-group-profile').getByRole('heading', { name: 'Your profile', level: 2 })).toBeVisible()
    await expect(page.getByLabel('Display name')).toBeVisible()
    const settings = page.getByTestId('account-group-settings')
    await expect(settings.getByRole('heading', { name: 'Account Settings', level: 2 })).toBeVisible()
    await expect(page.getByTestId('celebrations-setting')).toBeHidden()

    // Groups work from the keyboard (Enter on the summary).
    await settings.locator('summary').first().focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('celebrations-setting')).toBeVisible()
    for (const [id, name] of [
      ['reminders', 'Reminders'],
      ['events', 'Events'],
      ['people', 'People'],
      ['data', 'Your data'],
    ] as const) {
      await expect(settings.getByTestId(`account-group-${id}`).getByRole('heading', { name, level: 2 })).toBeVisible()
    }
    await expect(page.getByTestId('event-settings')).toBeHidden()

    // Open Events: settings and availability are both there; it stays open after a reload.
    await page.getByTestId('account-group-events').locator('summary').click()
    await expect(page.getByTestId('event-settings')).toBeVisible()
    await expect(page.getByTestId('availability')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('event-settings')).toBeVisible()
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

test.describe('Spec §5 Account page: Sign out and Delete account', () => {
  test('Sign out and Delete account are always visible, outside the groups, Sign out first', async ({ page }) => {
    const server = new FakeSupabase()
    server.openAccountGroups = false
    await server.install(page)
    await page.goto('/account')
    const signOut = page.getByTestId('sign-out')
    await expect(signOut.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.getByTestId('delete-account')).toBeVisible()
    // It comes straight after the Account Settings group, and before Delete account.
    const next = await page.getByTestId('account-group-settings').evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'))
    expect(next).toBe('sign-out')
    expect(await signOut.evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'))).toBe('delete-account')
    await signOut.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})
