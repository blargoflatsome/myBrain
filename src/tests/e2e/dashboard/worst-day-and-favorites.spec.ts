import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-11T01:00:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Dashboard: worst day and favorite buckets', () => {
  test('"Days since your worst day" counts the days in a row answered Yes', async ({ page }) => {
    const entry = (date: string, better: boolean | null) => ({ id: `j-${date}`, date, body: '', tomorrow: '', better_than_yesterday: better, stats: {}, auto: false, stats_final: true })
    server.seed('journal_entries', [entry('2026-11-06', false), entry('2026-11-07', true), entry('2026-11-08', true), entry('2026-11-09', true)])
    await open(page, '/')
    await expect(page.getByText(msg.dashboard.worstDay)).toBeVisible()
    await expect(page.getByTestId('dash-worst-day')).toHaveText('3')
  })

  test('a starred bucket shows on the Dashboard with its 3 newest items and opens the bucket', async ({ page }) => {
    await open(page, '/vault')
    await page.getByRole('button', { name: /^Shopping list/ }).click()
    const add = page.getByRole('textbox', { name: 'Add to Shopping list' })
    for (const title of ['Milk', 'Eggs', 'Bread', 'Jam']) {
      await add.fill(title)
      await add.press('Enter')
      await page.clock.runFor(1000)
    }
    const star = page.getByRole('button', { name: 'Star Shopping list' })
    await star.click()
    await expect(page.getByRole('button', { name: 'Unstar Shopping list' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => server.written('vault_buckets').find((b) => b.name === 'Shopping list' && b.starred)).toBeTruthy()

    await goTo(page, 'Dashboard')
    const card = page.getByTestId('dash-favorite')
    await expect(card).toHaveCount(1)
    await expect(card.getByRole('listitem')).toHaveText(['Jam', 'Bread', 'Eggs'])
    await card.click()
    await expect(page.getByRole('textbox', { name: 'Add to Shopping list' })).toBeVisible()
  })

  test('with nothing starred there is no favorites section', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    await expect(page.getByTestId('dash-favorites')).toHaveCount(0)
  })
})

