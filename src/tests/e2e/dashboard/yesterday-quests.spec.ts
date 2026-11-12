import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Dashboard: quests done yesterday', () => {
  test('"How past you did yesterday" counts and names them', async ({ page }) => {
    server.seed('quests', [{ id: 'q1', title: 'Paint the fence', status: 'open', times_picked: 1 }])
    server.seed('quest_logs', [{ id: 'l1', quest_id: 'q1', date: '2026-11-09', completed_at: '2026-11-09T20:00:00Z' }])
    await open(page, '/')
    const yesterday = page.getByTestId('dash-yesterday')
    await expect(yesterday.getByTestId('dash-yesterday-quests')).toHaveText('1')
    await expect(yesterday.getByTestId('dash-yesterday-quest')).toHaveText('✓ Paint the fence')
  })
})

