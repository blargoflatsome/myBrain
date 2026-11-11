import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { FakeSupabase } from './support/fakeSupabase'

// SPEC §5 Tags page: every tag with what it's on, search by a tag, rename, merge and delete (with Undo).
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:20:00Z')
const LONG_WORD = 'https://example.com/a/really/long/link/that/someone/pasted'
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  server.seed('tasks', [
    { id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' },
    { id: 't2', title: 'Sweep', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' },
  ])
  server.seed('habits', [{ id: 'h1', title: 'Water plants', notify_time: null, timer_minutes: null, weekdays: [4], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0 }])
  server.seed('tags', [
    { id: 'tag-chores', name: 'chores' },
    { id: 'tag-money', name: 'Money' },
    { id: 'tag-house', name: 'house' },
    { id: 'tag-unused', name: 'someday' },
  ])
  server.seed('item_tags', [
    { id: 'it1', tag_id: 'tag-chores', item_type: 'task', item_id: 't2' },
    { id: 'it2', tag_id: 'tag-chores', item_type: 'habit', item_id: 'h1' },
    { id: 'it3', tag_id: 'tag-money', item_type: 'task', item_id: 't1' },
    { id: 'it4', tag_id: 'tag-house', item_type: 'task', item_id: 't2' },
  ])
})

async function open(page: Page, path = '/tags') {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
/** The server's latest copy of a row. */
const latest = (table: string, id: string) => server.written(table).filter((r) => r.id === id).at(-1)
const row = (page: Page, name: string) => page.getByTestId('tag-row').filter({ has: page.getByTestId('tag-name').getByText(`#${name}`, { exact: true }) })
async function edit(page: Page, name: string) {
  await page.getByRole('button', { name: `Edit #${name}` }).click()
  return page.getByRole('dialog', { name: 'Edit tag' })
}

test.describe('Spec §5 Tags page', () => {
  test('is reached from the Account page and lists every tag A to Z with what it is on', async ({ page }) => {
    await open(page, '/account')
    await page.getByTestId('account-tags').getByRole('link', { name: 'Open Tags' }).click()
    await expect(page).toHaveURL(/\/tags$/)
    await expect(page.getByRole('heading', { name: 'Tags', level: 1 })).toBeVisible()
    await expect(page.getByTestId('tag-name')).toHaveText(['#chores', '#house', '#Money', '#someday'])
    await expect(page.getByTestId('tag-counts')).toHaveText(['1 task · 1 habit', '1 task', '1 task', 'Not on anything'])
  })

  test('tapping a tag opens Search filtered to it', async ({ page }) => {
    await open(page)
    await row(page, 'chores').getByRole('button', { name: /^Show everything tagged #chores/ }).click()
    const search = page.getByRole('dialog', { name: 'Search' })
    await expect(search.getByRole('button', { name: '#chores' })).toHaveAttribute('aria-pressed', 'true')
    await expect(search.getByTestId('search-result')).toHaveCount(2)
    await expect(search.getByTestId('search-result')).toContainText(['Sweep', 'Water plants'])
  })

  test('rename moves every item to the new name, and Undo puts it back', async ({ page }) => {
    await open(page)
    const dialog = await edit(page, 'chores')
    await dialog.getByLabel('Name').fill('  jobs   to do ')
    await dialog.getByRole('button', { name: 'Save tag' }).click()
    await expect(dialog).toBeHidden()
    await expect(row(page, 'jobs to do').getByTestId('tag-counts')).toHaveText('1 task · 1 habit')
    await expect(row(page, 'chores')).toHaveCount(0)
    await expect.poll(() => latest('tags', 'tag-chores')?.deleted_at).toBeTruthy()
    await expect.poll(() => server.written('item_tags').filter((r) => r.tag_id !== 'tag-chores' && !r.deleted_at && ['t2', 'h1'].includes(String(r.item_id))).length).toBe(2)

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(row(page, 'chores').getByTestId('tag-counts')).toHaveText('1 task · 1 habit')
    await expect(row(page, 'jobs to do')).toHaveCount(0)
    await expect.poll(() => latest('tags', 'tag-chores')?.deleted_at).toBeNull()
    await expect.poll(() => latest('item_tags', 'it1')?.deleted_at).toBeNull()
  })

  test('changing only capitals keeps the same tag', async ({ page }) => {
    await open(page)
    const dialog = await edit(page, 'Money')
    await dialog.getByLabel('Name').fill('money')
    await dialog.getByRole('button', { name: 'Save tag' }).click()
    await expect.poll(() => latest('tags', 'tag-money')).toMatchObject({ name: 'money', deleted_at: null })
  })

  test('renaming to a name another tag has offers to merge them', async ({ page }) => {
    await open(page)
    const dialog = await edit(page, 'chores')
    await dialog.getByLabel('Name').fill('HOUSE')
    await dialog.getByRole('button', { name: 'Save tag' }).click()
    await expect(dialog.getByTestId('tag-clash')).toHaveText(/There's already a tag called #house\. Merge them\?/)
    await dialog.getByRole('button', { name: 'Merge them' }).click()
    await expect(dialog).toBeHidden()
    // Sweep already had #house, so only the habit gets a new link.
    await expect(row(page, 'house').getByTestId('tag-counts')).toHaveText('1 task · 1 habit')
    await expect(row(page, 'chores')).toHaveCount(0)
    await expect(page.getByText('Merged #chores into #house')).toBeVisible()
  })

  test('merge into a chosen tag, and Undo splits them again', async ({ page }) => {
    await open(page)
    const dialog = await edit(page, 'Money')
    await dialog.getByRole('combobox', { name: 'Choose a tag' }).selectOption({ label: '#chores' })
    await dialog.getByRole('button', { name: 'Merge', exact: true }).click()
    await expect(row(page, 'chores').getByTestId('tag-counts')).toHaveText('2 tasks · 1 habit')
    await expect(row(page, 'Money')).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(row(page, 'Money').getByTestId('tag-counts')).toHaveText('1 task')
    await expect(row(page, 'chores').getByTestId('tag-counts')).toHaveText('1 task · 1 habit')
  })

  test('delete takes the tag off every item (the items stay), with Undo', async ({ page }) => {
    await open(page)
    const dialog = await edit(page, 'chores')
    await dialog.getByRole('button', { name: 'Delete tag' }).click()
    await expect(row(page, 'chores')).toHaveCount(0)
    await expect.poll(() => latest('tags', 'tag-chores')?.deleted_at).toBeTruthy()
    await expect.poll(() => latest('item_tags', 'it2')?.deleted_at).toBeTruthy()
    expect(server.written('tasks').filter((t) => t.deleted_at)).toEqual([])
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(row(page, 'chores').getByTestId('tag-counts')).toHaveText('1 task · 1 habit')
  })

  test('long tag names fit at 320 px, and the page and window pass the accessibility checks', async ({ page }) => {
    server.seed('tags', [{ id: 'tag-long', name: LONG_WORD }])
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)
    await expect(row(page, LONG_WORD)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([])
    await edit(page, LONG_WORD)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([])
  })
})
