import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-11T01:00:00Z')

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

test.describe('Spec §5 Dashboard: worst day and favorite buckets', () => {
  test('an item can be deleted from the bucket list, with Undo (SPEC §2)', async ({ page }) => {
    server.seed('vault_buckets', [{ id: 'b-groc', name: 'Groceries', position: 9, checkable: false, starred: false }])
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'b-groc', title: 'Milk', notes: null, created_at: '2026-11-01T00:00:00Z' }])
    await open(page, '/vault?bucket=b-groc')
    await expect(page.getByTestId('vault-item')).toHaveText(['Milk'])
    await page.getByRole('button', { name: 'Delete Milk' }).click()
    await expect(page.getByTestId('vault-item')).toHaveCount(0)
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.deleted('Milk'))
    await page.getByTestId('undo-bar').getByRole('button', { name: msg.undo.undo }).click()
    await expect(page.getByTestId('vault-item')).toHaveText(['Milk'])
    await page.getByRole('button', { name: 'Delete Milk' }).click()
    await expect(page.getByTestId('vault-item')).toHaveCount(0)
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ id: 'v1', deleted_at: expect.any(String) })
  })
})
