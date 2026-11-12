import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Global search and tags', () => {
  function seedSearchable() {
    server.seed('tasks', [{ id: 't1', title: 'Book café table', notes: 'for Sam', due_date: '2026-11-12', priority: 1, status: 'open', source: 'manual' }])
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-1', title: 'Luigi’s', notes: 'Best cafe in town' }])
    server.seed('quests', [{ id: 'q1', title: 'Learn to bake', status: 'open' }])
    server.seed('tags', [{ id: 'tag-food', name: 'food' }])
    server.seed('item_tags', [{ id: 'it1', tag_id: 'tag-food', item_type: 'task', item_id: 't1' }])
  }
  async function openSearch(page: Page) {
    const header = page.getByRole('banner').getByRole('button', { name: msg.nav.search })
    if (await header.isVisible()) await header.click()
    else await page.getByRole('navigation', { name: msg.nav.label }).getByRole('button', { name: msg.nav.search }).click()
    return page.getByRole('dialog', { name: msg.nav.search })
  }

  test('search opens over the page and finds items of every type, ignoring case and accents', async ({ page }) => {
    seedSearchable()
    await open(page, '/habits')
    const dialog = await openSearch(page)
    await expect(page).toHaveURL(/\/habits$/)
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('CAFE')
    await expect(dialog.getByTestId('results-task')).toContainText('Book café table')
    await expect(dialog.getByTestId('results-vault_item')).toContainText('Luigi’s')
    await expect(dialog.getByTestId('results-vault_item')).toContainText('Restaurant reviews')
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('zebra')
    await expect(dialog.getByRole('status')).toHaveText("I can't find anything matching that.")
  })

  test('tapping a result opens it where it lives', async ({ page }) => {
    seedSearchable()
    await open(page, '/')
    let dialog = await openSearch(page)
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('luigi')
    await dialog.getByTestId('search-result').click()
    await expect(page).toHaveURL(/\/vault\?bucket=bucket-1/)
    await expect(page.getByRole('dialog', { name: msg.vault.itemEditor.heading })).toBeVisible()
    await page.getByRole('dialog', { name: msg.vault.itemEditor.heading }).getByRole('button', { name: msg.share.close }).first().click()

    dialog = await openSearch(page)
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('cafe table')
    await dialog.getByTestId('search-result').click()
    await expect(page.getByRole('dialog', { name: msg.tasks.editor.heading })).toBeVisible()
    await expect(page.getByRole('dialog', { name: msg.tasks.editor.heading }).getByLabel(msg.capture.titleLabel)).toHaveValue('Book café table')
  })

  test('results can be filtered by tag, and a tag alone lists everything with it', async ({ page }) => {
    seedSearchable()
    await open(page, '/')
    const dialog = await openSearch(page)
    await dialog.getByRole('button', { name: '#food' }).click()
    await expect(dialog.getByTestId('search-result')).toHaveCount(1)
    await expect(dialog.getByTestId('search-result')).toContainText('Book café table')
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('cafe')
    await expect(dialog.getByTestId('search-result')).toHaveCount(1)
  })

  test('tags can be added to a task', async ({ page }) => {
    server.seed('tasks', [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Pay rent', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' }])
    await open(page, '/tasks')
    await page.getByRole('button', { name: /^Pay rent/ }).click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await dialog.getByText(msg.forms.moreOptions).click()
    await dialog.getByRole('combobox', { name: msg.tags.add }).fill('money')
    await dialog.getByRole('combobox', { name: msg.tags.add }).press('Enter')
    await expect(dialog.getByTestId('tag-chip')).toHaveText(/#money/)
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => server.written('item_tags').length).toBe(1)
    expect(server.written('item_tags')[0]).toMatchObject({ item_type: 'task', item_id: 'aaaaaaaa-0000-4000-8000-000000000001' })
    expect(server.written('tags')[0]).toMatchObject({ name: 'money' })
  })
})

