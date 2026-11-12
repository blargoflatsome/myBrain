import { expect, test } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

test.describe('Spec §5 Account page: grouped into sections that open and close', () => {
  test('only Your profile starts open; the other groups sit beside it (none inside another), open with a tap and stay as I left them', async ({ page }) => {
    const server = new FakeSupabase()
    server.openAccountGroups = false
    await server.install(page)
    await page.goto('/account')
    await expect(page.getByTestId('account-group-profile').getByRole('heading', { name: msg.profile.settingsHeading, level: 2 })).toBeVisible()
    await expect(page.getByLabel(msg.profile.displayName)).toBeVisible()
    const settings = page.getByTestId('account-group-settings')
    await expect(settings.getByRole('heading', { name: msg.accountGroups.settingsTitle, level: 2 })).toBeVisible()
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
      await expect(page.getByTestId(`account-group-${id}`).getByRole('heading', { name, level: 2 })).toBeVisible()
      await expect(settings.getByTestId(`account-group-${id}`)).toHaveCount(0)
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
    await expect(signOut.getByRole('button', { name: msg.signOut.button })).toBeVisible()
    await expect(page.getByTestId('delete-account')).toBeVisible()
    // It comes straight after the last group (Your data), and before Delete account.
    const next = await page.getByTestId('account-group-data').evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'))
    expect(next).toBe('sign-out')
    expect(await signOut.evaluate((el) => el.nextElementSibling?.getAttribute('data-testid'))).toBe('delete-account')
    await signOut.getByRole('button', { name: msg.signOut.button }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('Spec §8 Sign out: nothing of mine stays on this device, and unsent changes are only dropped if I agree', async ({ page, context }) => {
    const server = new FakeSupabase()
    await server.install(page)
    await page.goto('/account')
    await expect(page.getByTestId('sync-indicator')).toHaveText(msg.sync.online)
    const myDb = () => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name?.startsWith('my-brain-')))
    await expect.poll(myDb).toBe(true)

    // Offline with a change waiting: asks first, and Stay signed in keeps everything.
    await page.getByRole('button', { name: `+ ${msg.capture.openButton}` }).click()
    const capture = page.getByRole('dialog', { name: msg.capture.windowLabel })
    await expect(capture.getByRole('heading', { name: msg.capture.typeHeading })).toBeVisible()
    await context.setOffline(true)
    await capture.getByRole('button', { name: msg.capture.destinations.later, exact: true }).click()
    await capture.getByLabel(msg.capture.placeholder).fill('idea on the subway')
    await capture.getByTestId('capture-save').click()
    await expect(page.getByTestId('sync-indicator')).toContainText(msg.sync.pending(1))
    await capture.getByRole('button', { name: msg.capture.close }).click()
    await page.getByTestId('sign-out').getByRole('button', { name: msg.signOut.button }).click()
    const ask = page.getByRole('alertdialog', { name: msg.signOut.unsent.heading })
    await expect(ask).toContainText(msg.signOut.unsent.body(1))
    await ask.getByRole('button', { name: msg.signOut.unsent.keep }).click()
    await expect(page).toHaveURL(/\/account$/)

    // Back online, it uploads first, then signs out and deletes this device's copy and remembered settings.
    await context.setOffline(false)
    await page.getByTestId('sign-out').getByRole('button', { name: msg.signOut.button }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    expect(server.written('inbox').at(-1)).toMatchObject({ body: 'idea on the subway' })
    await expect.poll(myDb).toBe(false)
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('my-brain:')))).toEqual([])
  })
})
