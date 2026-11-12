import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

const DAY = '2026-11-10'

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Random Quest: done quests stay; Pick and delete in the list', () => {
  test.beforeEach(() => {
    server.seed('quests', [
      { id: 'q1', title: 'Paint the fence', details: '<p>Use the <strong>blue</strong> paint</p>', energy_level: 'ugh', time_bucket: '30m', status: 'open', times_picked: 0 },
      { id: 'q2', title: LONG_LINE, details: null, energy_level: 'fun', time_bucket: '2h', status: 'open', times_picked: 0 },
    ])
  })

  test('Pick shows that quest, with its formatted details; Mark done keeps it in the list', async ({ page }) => {
    await open(page, '/quests')
    await page.getByRole('button', { name: 'Pick Paint the fence' }).click()
    const result = page.getByTestId('quest-result')
    await expect(result.getByRole('heading', { name: 'Paint the fence' })).toBeVisible()
    await expect(result.locator('strong')).toHaveText('blue')
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', times_picked: 1 })
    await result.getByRole('button', { name: msg.quests.done }).click()
    await expect.poll(() => lastWrite('quest_logs')).toMatchObject({ quest_id: 'q1', date: DAY })
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', status: 'open' })
    const row = page.getByTestId('quest-row').filter({ hasText: 'Paint the fence' })
    await expect(row.getByTestId('quest-done-count')).toHaveText(msg.quests.doneCount(1))
  })

  test('the trash can removes the quest straight away, with Undo (SPEC §2)', async ({ page }) => {
    await open(page, '/quests')
    await page.getByRole('button', { name: 'Delete Paint the fence' }).click()
    await expect(page.getByTestId('quest-row').filter({ hasText: 'Paint the fence' })).toHaveCount(0)
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', deleted_at: expect.any(String) })
  })
})

