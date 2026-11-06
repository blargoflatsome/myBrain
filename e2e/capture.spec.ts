import { expect, test } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

const box = (page: import('@playwright/test').Page) => page.getByRole('textbox', { name: "What's on your mind?" })

test.describe('Spec §5 Quick capture', () => {
  test('a persistent Capture button opens capture from anywhere in the app', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '+ Capture' }).click()
    await expect(page).toHaveURL(/\/capture$/)
    await expect(box(page)).toBeFocused()
  })

  test('Task with no date is saved to the Undated list', async ({ page }) => {
    await page.goto('/capture')
    await box(page).fill('call the plumber')
    await page.getByRole('button', { name: 'Task', exact: true }).click()
    await page.getByRole('button', { name: 'Save task' }).click()

    await expect(page.getByTestId('capture-notice')).toHaveText('Saved. Future you will find it in Undated.')
    await expect(box(page)).toHaveValue('')
    await expect.poll(() => server.written('tasks')).toEqual([
      expect.objectContaining({ title: 'call the plumber', due_date: null, source: 'capture', status: 'open' }),
    ])
  })

  test('Task with a date is scheduled for that day', async ({ page }) => {
    await page.goto('/capture')
    await box(page).fill('dentist')
    await page.getByRole('button', { name: 'Task', exact: true }).click()
    await page.getByLabel('When? (optional)').fill('2026-11-09')
    await page.getByRole('button', { name: 'Save task' }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved. Future you will find it waiting in Tasks.')
    await expect.poll(() => server.written('tasks')[0]?.due_date).toBe('2026-11-09')
  })

  test('The Vault saves into the picked bucket (starter buckets are there)', async ({ page }) => {
    await page.goto('/capture')
    await box(page).fill('oat milk')
    await page.getByRole('button', { name: 'The Vault' }).click()
    await expect(page.getByRole('group', { name: 'Which bucket?' }).getByRole('button')).toHaveText([
      'Shopping list',
      'Restaurant reviews',
      'Places to go',
      '+ New bucket',
    ])
    await page.getByRole('button', { name: 'Shopping list' }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved to Shopping list. Future you will be glad you did.')
    await expect.poll(() => server.written('vault_items')[0]).toMatchObject({ title: 'oat milk', bucket_id: 'bucket-0' })
  })

  test('The Vault bucket picker can make a new bucket and save into it', async ({ page }) => {
    await page.goto('/capture')
    await box(page).fill('Piranesi')
    await page.getByRole('button', { name: 'The Vault' }).click()
    await page.getByRole('button', { name: '+ New bucket' }).click()
    await page.getByRole('textbox', { name: 'New bucket' }).fill('Books')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved to Books. Future you will be glad you did.')
    await expect.poll(() => server.written('vault_buckets').map((b) => b.name)).toEqual(['Books'])
    await expect.poll(() => server.written('vault_items')[0]?.title).toBe('Piranesi')
  })

  test('Quest saves to the quest bucket', async ({ page }) => {
    await page.goto('/capture')
    await box(page).fill('build a birdhouse')
    await page.getByRole('button', { name: 'Quest' }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Added to your quests. Future you has something for a bored day.')
    await expect.poll(() => server.written('quests')[0]?.title).toBe('build a birdhouse')
  })

  test('an empty thought is not saved', async ({ page }) => {
    await page.goto('/capture')
    await page.getByRole('button', { name: 'Quest' }).click()
    await expect(page.getByRole('alert')).toHaveText('Nothing to save yet. What did past you want to remember?')
    expect(server.writes).toHaveLength(0)
  })

  test('Decide later saves to the inbox, and filing it from the inbox moves it', async ({ page }) => {
    await page.goto('/capture')
    await box(page).fill('maybe learn Portuguese')
    await page.getByRole('button', { name: 'Decide later' }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText("Saved to your inbox. Future you can sort it when there's time.")

    await page.getByRole('link', { name: /Inbox/ }).click()
    await expect(page.getByText('Past you jotted this down. Where should it go?')).toBeVisible()
    await expect(page.getByText('maybe learn Portuguese')).toBeVisible()
    await page.getByRole('button', { name: 'Quest' }).click()

    await expect(page.getByText("Past you hasn't left anything to sort. Nice.")).toBeVisible()
    await expect.poll(() => server.written('quests')[0]?.title).toBe('maybe learn Portuguese')
    await expect.poll(() => server.written('inbox').some((r) => r.deleted_at)).toBe(true)
  })
})

test.describe('Spec §2/§5/§7: capture works offline and syncs later', () => {
  test('a capture made offline is kept, shown as waiting, and uploads on reconnect', async ({ page, context }) => {
    await page.goto('/capture')
    await expect(page.getByTestId('sync-indicator')).toHaveText('Synced')

    await context.setOffline(true)
    await box(page).fill('idea on the subway')
    await page.getByRole('button', { name: 'Decide later' }).click()

    await expect(page.getByTestId('capture-notice')).toHaveText("Saved on this device. It'll sync when you're back online.")
    await expect(page.getByTestId('sync-indicator')).toHaveText('Offline · 1 waiting to sync')
    expect(server.written('inbox')).toHaveLength(0)

    await context.setOffline(false)
    await expect(page.getByTestId('sync-indicator')).toHaveText('Synced')
    await expect.poll(() => server.written('inbox')[0]?.body).toBe('idea on the subway')
  })

  test('the installed app opens with no connection (service worker)', async ({ page, context }) => {
    await page.goto('/capture')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await context.setOffline(true)
    await page.reload()
    await expect(box(page)).toBeVisible()
  })
})

test.describe('Spec §3: PWA install, home-screen shortcut, Web Share Target', () => {
  test('the manifest has a Capture shortcut and a share target that opens capture', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({ name: 'My Brain', display: 'standalone', start_url: '/' })
    expect(manifest.shortcuts).toEqual([expect.objectContaining({ name: 'Capture', url: '/capture' })])
    expect(manifest.share_target).toMatchObject({ action: '/capture', method: 'GET' })
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  })

  test('text shared from another app arrives in the capture box', async ({ page }) => {
    await page.goto('/capture?title=Great%20recipe&text=https%3A%2F%2Fexample.com%2Fsoup')
    await expect(box(page)).toHaveValue('Great recipe\nhttps://example.com/soup')
    await expect(page).toHaveURL(/\/capture$/)
  })
})
