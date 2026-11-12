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

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Tasks: Clear crossed-off', () => {
  test('hides done tasks from the list, keeps them (not deleted), and today still counts as all done', async ({ page }) => {
    server.seed('tasks', [
      { id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'done', completed_at: '2026-11-10T14:00:00Z', source: 'manual', created_at: '2026-11-01T00:00:01Z' },
      { id: 't2', title: LONG_LINE, notes: null, due_date: DAY, priority: 1, status: 'done', completed_at: '2026-11-10T14:05:00Z', source: 'manual', created_at: '2026-11-01T00:00:02Z' },
    ])
    await open(page, '/tasks')
    await page.getByTestId('clear-done').click()
    await expect(page.getByTestId('task-title')).toHaveCount(0)
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.clearedTasks(2))
    await expect(page.getByText(msg.tasks.allDone)).toBeVisible()
    await expect(page.getByTestId('clear-done')).toHaveCount(0)
    await expect.poll(() => server.written('tasks').length).toBe(2)
    for (const t of server.written('tasks')) expect(t).toMatchObject({ status: 'done', cleared_at: expect.any(String), deleted_at: null })
  })

  test('the button only shows when something is crossed off', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await expect(page.getByText('pay rent')).toBeVisible()
    await expect(page.getByTestId('clear-done')).toHaveCount(0)
  })
})

