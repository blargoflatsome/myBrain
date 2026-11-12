import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
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

test.describe('Spec §5 Account page', () => {
  test('shows my name, lets me edit it, and streaks are private (only me) by default; there is no bio', async ({ page }) => {
    await open(page, '/account')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test Person')
    await expect(page.getByLabel(msg.profile.visibility)).toHaveValue('private')

    await expect(page.getByLabel('Short bio')).toHaveCount(0)
    await page.getByLabel(msg.profile.displayName).fill('Jo')
    await page.getByLabel(msg.profile.visibility).selectOption('everyone')
    await page.getByRole('button', { name: msg.profile.save }).click()
    await expect(page.getByText(msg.profile.saved, { exact: true })).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({ display_name: 'Jo', streak_visibility: 'everyone' })
  })

  test('Spec §9: Delete My Account confirms first, then deletes everything and signs me out', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: msg.profile.deleteButton }).click()
    const dialog = page.getByRole('dialog', { name: msg.profile.deleteConfirm.heading })
    await expect(dialog).toContainText(msg.profile.deleteConfirm.body)
    const confirm = dialog.getByRole('button', { name: msg.profile.deleteConfirm.confirm })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(msg.deleteData.typeLabel).fill('delete')
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByRole('status')).toHaveText(msg.signIn.deleted)
    // Only reads besides the deletion (the Account page also checks which saved people use My Brain).
    expect(server.rpcCalls.filter((c) => c !== 'people_with_accounts')).toEqual(['delete_my_account'])
    // This device's copy is gone too.
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
    expect(names.filter((n) => n?.startsWith('my-brain-'))).toEqual([])
  })

  test('Spec §2: choosing Keep my account deletes nothing', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: msg.profile.deleteButton }).click()
    const dialog = page.getByRole('dialog', { name: msg.profile.deleteConfirm.heading })
    await dialog.getByRole('button', { name: msg.profile.deleteConfirm.keep }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/account$/)
    expect(server.rpcCalls.filter((c) => c !== 'people_with_accounts')).toEqual([])
  })

  test('Spec §9: if deletion fails, I am told and stay signed in', async ({ page }) => {
    server.failRpc = true
    await open(page, '/account')
    await page.getByRole('button', { name: msg.profile.deleteButton }).click()
    const dialog = page.getByRole('dialog', { name: msg.profile.deleteConfirm.heading })
    await dialog.getByLabel(msg.deleteData.typeLabel).fill('DELETE')
    await dialog.getByRole('button', { name: msg.profile.deleteConfirm.confirm }).click()
    await expect(dialog.getByRole('alert')).toHaveText("Couldn't delete your account. Check your connection and try again.")
    await expect(page).toHaveURL(/\/account$/)
  })
})

