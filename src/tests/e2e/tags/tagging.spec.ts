import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

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

test.describe('Spec §5 Tags: only on tasks, habits and routines', () => {

  test('a habit’s tag is saved, and search finds habits', async ({ page }) => {
    server.seed('habits', [{ id: 'h1', title: 'Take out recycling', notify_time: null, timer_minutes: null, weekdays: [4], start_date: '2026-11-01', current_streak: 0, best_streak: 0 }])
    await open(page, '/habits')
    await page.getByRole('button', { name: /Take out recycling/ }).first().click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.heading })
    await dialog.getByRole('combobox', { name: msg.tags.add }).fill('chores')
    await dialog.getByRole('combobox', { name: msg.tags.add }).press('Enter')
    // Wait for the tag to be added before saving (Safari's engine is slower to show it).
    await expect(dialog.getByTestId('tag-chip')).toHaveText(/#chores/)
    await expect(dialog.getByRole('combobox', { name: msg.tags.add })).toHaveValue('')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('item_tags')).toMatchObject({ item_type: 'habit', item_id: 'h1' })
    const header = page.getByRole('banner').getByRole('button', { name: msg.nav.search })
    if (await header.isVisible()) await header.click()
    else await page.getByRole('navigation', { name: msg.nav.label }).getByRole('button', { name: msg.nav.search }).click()
    const search = page.getByRole('dialog', { name: msg.nav.search })
    await search.getByRole('searchbox').fill('recycling')
    await expect(search.getByTestId('results-habit')).toContainText('Take out recycling')
    await search.getByTestId('search-result').first().click()
    await expect(page.getByRole('dialog', { name: msg.habits.editor.heading })).toBeVisible()
  })
})

