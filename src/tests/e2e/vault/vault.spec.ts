import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 The Vault', () => {
  test('the Vault lists my buckets; inside one I can add items and check them off', async ({ page }) => {
    await open(page, '/')
    await goTo(page, 'The Vault')
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Places to go/, /Restaurant reviews/, /Shopping list\s*0 items/])
    await page.getByRole('button', { name: /^Shopping list/ }).click()

    const add = page.getByRole('textbox', { name: 'Add to Shopping list' })
    for (const title of ['Milk', 'Eggs', 'Bread']) {
      await add.fill(title)
      await add.press('Enter')
    }
    await expect(page.getByTestId('vault-item')).toHaveText(['Milk', 'Eggs', 'Bread'])
    await page.getByRole('checkbox', { name: 'Check off Milk' }).click()
    await expect(page.getByTestId('vault-item')).toHaveText(['Eggs', 'Bread', /Milk/])
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ title: 'Milk', checked: true })

    await page.getByRole('button', { name: msg.vault.clearChecked }).click()
    await expect(page.getByTestId('vault-item')).toHaveText(['Eggs', 'Bread'])
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.clearedChecked(1))
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ title: 'Milk', deleted_at: expect.any(String) })
  })

  test('an item can have a star rating, a link or address and notes (no tags)', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-1', title: 'Luigi’s', notes: null }])
    await open(page, '/vault?bucket=bucket-1')
    await page.getByRole('button', { name: 'Open Luigi’s' }).click()
    const dialog = page.getByRole('dialog', { name: msg.vault.itemEditor.heading })
    await dialog.getByText(msg.forms.moreOptions).click()
    await dialog.getByRole('radio', { name: '4 stars' }).click()
    await dialog.getByLabel(msg.vault.itemEditor.link).fill('luigis.example.com/menu')
    await dialog.getByRole('textbox', { name: msg.capture.notesLabel }).fill('Great carbonara')
    await expect(dialog.getByRole('combobox', { name: msg.tags.add })).toHaveCount(0)
    await dialog.getByRole('button', { name: msg.capture.save }).click()

    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ rating: 4, link: 'luigis.example.com/menu', notes: '<p>Great carbonara</p>' })
    const item = page.getByTestId('vault-item')
    await expect(item.getByRole('img', { name: '4 of 5 stars' })).toBeVisible()
    await expect(item.getByRole('link', { name: 'Open link: luigis.example.com' })).toHaveAttribute('href', 'https://luigis.example.com/menu')
  })

  test('an address opens in maps', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-2', title: 'Beach', link: '12 Ocean Ave, Santa Monica' }])
    await open(page, '/vault?bucket=bucket-2')
    await expect(page.getByRole('link', { name: 'Open in maps: 12 Ocean Ave, Santa Monica' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=12%20Ocean%20Ave%2C%20Santa%20Monica',
    )
  })

  test('buckets can be added (taking their place A to Z), renamed and made into a checklist', async ({ page }) => {
    await open(page, '/vault')
    await page.getByRole('button', { name: msg.vault.newBucket }).click()
    await page.getByRole('textbox', { name: msg.vault.newBucketName }).fill('Books')
    await page.getByRole('button', { name: msg.vault.createBucket }).click()
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Books/, /Places to go/, /Restaurant reviews/, /Shopping list/])

    await page.getByRole('button', { name: /^Books/ }).click()
    await page.getByRole('button', { name: msg.vault.settings }).click()
    const dialog = page.getByRole('dialog', { name: msg.vault.settings })
    await dialog.getByLabel(msg.tagsPage.editor.name).fill('Books to read')
    await dialog.getByRole('checkbox', { name: /Items can be checked off/ }).check()
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByRole('heading', { name: 'Books to read', level: 1 })).toBeVisible()
    await expect.poll(() => lastWrite('vault_buckets')).toMatchObject({ name: 'Books to read', checkable: true })
  })

  test('buckets are always favorites first, then A to Z, with nothing to drag', async ({ page }) => {
    server.seed('vault_buckets', [{ id: 'b-z', name: 'Zoo trips', position: 9, checkable: false, starred: true }])
    await open(page, '/vault')
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Zoo trips/, /Places to go/, /Restaurant reviews/, /Shopping list/])
    await expect(page.getByRole('button', { name: /^Reorder/ })).toHaveCount(0)
    // Starring one moves it up with the favorites.
    await page.getByRole('button', { name: /^Shopping list/ }).click()
    await page.getByRole('button', { name: 'Star Shopping list' }).click()
    await expect(page.getByRole('button', { name: 'Unstar Shopping list' })).toBeVisible()
    await expect.poll(() => server.written('vault_buckets').some((b) => b.name === 'Shopping list' && b.starred)).toBe(true)
    await page.goto('/vault')
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Shopping list/, /Zoo trips/, /Places to go/, /Restaurant reviews/])
  })

  test('deleting a bucket says how many items go with it, then deletes them', async ({ page }) => {
    server.seed('vault_items', [
      { id: 'v1', bucket_id: 'bucket-2', title: 'Beach' },
      { id: 'v2', bucket_id: 'bucket-2', title: 'Museum' },
    ])
    await open(page, '/vault?bucket=bucket-2')
    await page.getByRole('button', { name: msg.vault.settings }).click()
    await page.getByRole('dialog', { name: msg.vault.settings }).getByRole('button', { name: msg.vault.bucketEditor.delete }).click()
    const confirm = page.getByRole('alertdialog', { name: msg.vault.confirmBucketDelete.heading })
    await expect(confirm).toContainText(msg.vault.confirmBucketDelete.body('Places to go', 2))
    await confirm.getByRole('button', { name: msg.vault.confirmBucketDelete.confirm }).click()
    await expect(page.getByTestId('vault-bucket')).toHaveCount(2)
    await expect.poll(() => server.written('vault_items').filter((i) => i.deleted_at).length).toBe(2)
    await expect.poll(() => lastWrite('vault_buckets')).toMatchObject({ id: 'bucket-2', deleted_at: expect.any(String) })
  })
})

