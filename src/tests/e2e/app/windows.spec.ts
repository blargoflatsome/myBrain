import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

const DAY = '2026-11-10'

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

test.describe('Spec §2 Windows: a close ✕ top right, and a click outside closes', { tag: '@phone' }, () => {
  test.beforeEach(() => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
  })

  test('the ✕ sits in the top right corner and closes the window', async ({ page }) => {
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    const x = dialog.getByRole('button', { name: msg.share.close }).and(dialog.getByTestId('close-x'))
    const box = (await dialog.boundingBox())!
    const xBox = (await x.boundingBox())!
    expect(xBox.x + xBox.width).toBeGreaterThan(box.x + box.width - 16)
    expect(xBox.y).toBeLessThan(box.y + 16)
    await x.click()
    await expect(dialog).toBeHidden()
  })

  test('a click on the dimmed background closes it; a click inside does not', async ({ page }) => {
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await dialog.getByRole('heading', { name: msg.tasks.editor.heading }).click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(4, 4)
    await expect(dialog).toBeHidden()
  })
})

