import { expect, test } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  server.seed('inbox', [
    { id: 'i2', body: 'middle idea', created_at: '2026-11-02T00:00:00Z' },
    { id: 'i3', body: 'newest idea', created_at: '2026-11-03T00:00:00Z' },
    { id: 'i1', body: 'oldest idea', created_at: '2026-11-01T00:00:00Z' },
  ])
})

const body = (page: import('@playwright/test').Page) => page.getByTestId('orphan-body')
const position = (page: import('@playwright/test').Page) => page.getByTestId('orphan-position')

test.describe('Spec §5 Orphans: one at a time', () => {
  test('shows the oldest first; Skip moves it to the back of the line', async ({ page }) => {
    await page.goto('/orphans')
    await expect(body(page)).toHaveText('oldest idea')
    await expect(position(page)).toHaveText(msg.inbox.position(1, 3))
    await page.getByTestId('orphan-skip').click()
    await expect(body(page)).toHaveText('middle idea')
    await page.getByTestId('orphan-skip').click()
    await page.getByTestId('orphan-skip').click()
    await expect(body(page)).toHaveText('oldest idea')
    expect(server.writes).toHaveLength(0)
  })

  test('filing one shows the next; filing as a Post It turns the words into a note', async ({ page }) => {
    await page.goto('/orphans')
    await page.getByRole('button', { name: msg.capture.destinations.postit, exact: true }).click()
    await expect(body(page)).toHaveText('middle idea')
    await expect(position(page)).toHaveText(msg.inbox.position(1, 2))
    await expect.poll(() => server.written('post_its')[0]?.body).toContain('oldest idea')
    await expect.poll(() => server.written('inbox').find((r) => r.id === 'i1')?.deleted_at).toBeTruthy()
  })

  test('the trash can deletes it with Undo', async ({ page }) => {
    await page.goto('/orphans')
    await page.getByRole('button', { name: msg.inbox.deleteLabel }).click()
    await expect(body(page)).toHaveText('middle idea')
    await page.getByRole('button', { name: msg.undo.undo, exact: true }).click()
    await expect(body(page)).toHaveText('oldest idea')
    await expect.poll(() => server.written('inbox').filter((r) => r.id === 'i1').at(-1)?.deleted_at).toBeNull()
  })
})
