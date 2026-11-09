import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { goTo } from './support/nav'

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

const typeGroup = (page: Page) => page.getByRole('group', { name: 'What are you capturing?' })
const titleBox = (page: Page) => page.getByLabel('Title', { exact: true })
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

/** Open capture and choose a type (SPEC §5: type first). */
async function startCapture(page: Page, type: 'Task' | 'The Vault' | 'Quest' | 'Decide later') {
  await page.goto('/capture')
  await typeGroup(page).getByRole('button', { name: type, exact: true }).click()
}

test.describe('Spec §5 Quick capture: choose the type first', () => {
  test('a persistent Capture button opens capture over the current page, which asks for the type first', async ({ page }) => {
    await page.goto('/habits')
    await page.getByRole('button', { name: '+ Capture' }).click()
    const dialog = page.getByRole('dialog', { name: 'Capture' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/habits$/)
    await expect(dialog.getByRole('heading', { name: 'What are you capturing?' })).toBeVisible()
    await expect(typeGroup(page).getByRole('button')).toHaveText(['Task', 'The Vault', 'Quest', 'Habit', 'Post It', 'Decide later'])
  })

  test('the Capture window saves without leaving the page, and closing it returns to the page', async ({ page }) => {
    await page.goto('/habits')
    await page.getByRole('button', { name: '+ Capture' }).click()
    const dialog = page.getByRole('dialog', { name: 'Capture' })
    await typeGroup(page).getByRole('button', { name: 'Task', exact: true }).click()
    await dialog.getByLabel('Title', { exact: true }).fill('buy stamps')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByTestId('capture-notice')).toHaveText('Saved. Future you will find it in Undated.')
    await expect(page).toHaveURL(/\/habits$/)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Habits', level: 1 })).toBeVisible()
    expect(server.written('tasks')[0]).toMatchObject({ title: 'buy stamps', source: 'capture' })
  })

  test('Escape closes the Capture window', async ({ page }) => {
    await page.goto('/habits')
    await page.getByRole('button', { name: '+ Capture' }).click()
    await expect(page.getByRole('dialog', { name: 'Capture' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Capture' })).toBeHidden()
  })

  test('Back returns to the type choice without saving', async ({ page }) => {
    await startCapture(page, 'Quest')
    await titleBox(page).fill('never mind')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'What are you capturing?' })).toBeVisible()
    expect(server.writes).toHaveLength(0)
  })

  test('only the title is required: an empty title is not saved', async ({ page }) => {
    await startCapture(page, 'Quest')
    await save(page).click()
    await expect(page.getByRole('alert')).toHaveText('Nothing to save yet. What did past you want to remember?')
    expect(server.writes).toHaveLength(0)
  })
})

test.describe('Spec §5 Quick capture: Task form', () => {
  test('title only: saved as Low priority to the Undated list', async ({ page }) => {
    await startCapture(page, 'Task')
    await expect(titleBox(page)).toBeFocused()
    await titleBox(page).fill('call the plumber')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved. Future you will find it in Undated.')
    await expect.poll(() => server.written('tasks')).toEqual([
      expect.objectContaining({ title: 'call the plumber', notes: null, due_date: null, priority: 1, source: 'capture' }),
    ])
  })

  test('notes, date and priority are saved', async ({ page }) => {
    await startCapture(page, 'Task')
    await titleBox(page).fill('dentist')
    await page.getByLabel('Notes (optional)').fill('bring insurance card')
    await page.getByLabel('When? (optional)').fill('2026-11-09')
    await page.getByRole('group', { name: 'Priority' }).getByRole('button', { name: 'High' }).click()
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved. Future you will find it waiting in Tasks.')
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({
      notes: 'bring insurance card',
      due_date: '2026-11-09',
      priority: 3,
    })
  })
})

test.describe('Spec §5 Quick capture: The Vault form', () => {
  test('the first bucket is preselected, so only the title is needed', async ({ page }) => {
    await startCapture(page, 'The Vault')
    const buckets = page.getByRole('group', { name: 'Which bucket?' })
    // Buckets are listed A to Z (favorites would come first); the first one is preselected.
    await expect(buckets.getByRole('button')).toHaveText(['Places to go', 'Restaurant reviews', 'Shopping list', '+ New bucket'])
    await expect(buckets.getByRole('button', { name: 'Places to go' })).toHaveAttribute('aria-pressed', 'true')
    await titleBox(page).fill('Beach day')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved to Places to go. Future you will be glad you did.')
    await expect.poll(() => server.written('vault_items')[0]).toMatchObject({ title: 'Beach day', bucket_id: 'bucket-2' })
  })

  test('another bucket and notes can be chosen', async ({ page }) => {
    await startCapture(page, 'The Vault')
    await page.getByRole('group', { name: 'Which bucket?' }).getByRole('button', { name: 'Restaurant reviews' }).click()
    await titleBox(page).fill('Thai Garden')
    await page.getByLabel('Notes (optional)').fill('try the green curry')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved to Restaurant reviews. Future you will be glad you did.')
    await expect.poll(() => server.written('vault_items')[0]).toMatchObject({ bucket_id: 'bucket-1', notes: 'try the green curry' })
  })

  test('a new bucket can be made from the form', async ({ page }) => {
    await startCapture(page, 'The Vault')
    await page.getByRole('button', { name: '+ New bucket' }).click()
    await page.getByRole('textbox', { name: 'New bucket' }).fill('Books')
    await titleBox(page).fill('Piranesi')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Saved to Books. Future you will be glad you did.')
    await expect.poll(() => server.written('vault_buckets').map((b) => b.name)).toEqual(['Books'])
    await expect.poll(() => server.written('vault_items')[0]?.title).toBe('Piranesi')
  })
})

test.describe('Spec §5 Quick capture: Quest form', () => {
  test('shows Title, Details, Energy needed and Time needed; defaults are Ugh and 30 min', async ({ page }) => {
    await startCapture(page, 'Quest')
    await expect(page.getByLabel('Details (optional)')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Energy needed' }).getByRole('button', { name: 'Ugh' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Time needed' }).getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'true')
    await titleBox(page).fill('build a birdhouse')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Added to your quests. Future you has something for a bored day.')
    await expect.poll(() => server.written('quests')[0]).toMatchObject({
      title: 'build a birdhouse',
      details: null,
      energy_level: 'ugh',
      time_bucket: '30m',
    })
  })

  test('details, energy and time can be changed', async ({ page }) => {
    await startCapture(page, 'Quest')
    await titleBox(page).fill('kayak the river')
    await page.getByLabel('Details (optional)').fill('rent at the dock')
    await page.getByRole('group', { name: 'Energy needed' }).getByRole('button', { name: 'Medicated' }).click()
    await page.getByRole('group', { name: 'Time needed' }).getByRole('button', { name: 'Half a day' }).click()
    await save(page).click()
    await expect.poll(() => server.written('quests')[0]).toMatchObject({
      details: 'rent at the dock',
      energy_level: 'medicated',
      time_bucket: 'half_day',
    })
  })
})

test.describe('Spec §5: Decide later, then sort it when I have time', () => {
  test('Decide later saves the text to Orphans, and filing it as a Quest gives Ugh / 30 min', async ({ page }) => {
    await startCapture(page, 'Decide later')
    await page.getByLabel("What's on your mind?").fill('maybe learn Portuguese')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText("Saved to Orphans. Future you can sort it when there's time.")

    await goTo(page, /Orphans/)
    await expect(page.getByText('Past you jotted this down. Where should it go?')).toBeVisible()
    await page.getByRole('button', { name: 'Quest' }).click()
    await expect(page.getByText("Past you hasn't left any orphans.")).toBeVisible()
    await expect.poll(() => server.written('quests')[0]).toMatchObject({
      title: 'maybe learn Portuguese',
      energy_level: 'ugh',
      time_bucket: '30m',
    })
    await expect.poll(() => server.written('inbox').some((r) => r.deleted_at)).toBe(true)
  })
})

test.describe('Spec §2/§5/§7: capture works offline and syncs later', () => {
  test('a capture made offline is kept, shown as waiting, and uploads on reconnect', async ({ page, context }) => {
    await page.goto('/capture')
    await expect(page.getByTestId('sync-indicator')).toHaveText('Synced')

    await context.setOffline(true)
    await typeGroup(page).getByRole('button', { name: 'Decide later' }).click()
    await page.getByLabel("What's on your mind?").fill('idea on the subway')
    await save(page).click()

    await expect(page.getByTestId('capture-notice')).toHaveText("Saved on this device. It'll sync when you're back online.")
    await expect(page.getByTestId('sync-indicator')).toHaveText('Offline · 1 waiting to sync')
    expect(server.written('inbox')).toHaveLength(0)

    await context.setOffline(false)
    await expect(page.getByTestId('sync-indicator')).toHaveText('Synced')
    await expect.poll(() => server.written('inbox')[0]?.body).toBe('idea on the subway')
  })

  test('the installed app opens with no connection (service worker)', async ({ page, context }) => {
    test.skip(test.info().project.name === 'iphone', 'service workers are off in the iPhone test profile')
    await page.goto('/capture')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'What are you capturing?' })).toBeVisible()
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

  test('shared text waits while I pick the type, then fills the title and notes', async ({ page }) => {
    await page.goto('/capture?title=Great%20recipe&text=https%3A%2F%2Fexample.com%2Fsoup')
    await expect(page.getByTestId('shared-text')).toHaveText('Great recipe\nhttps://example.com/soup')
    await expect(page).toHaveURL(/\/capture$/)
    await typeGroup(page).getByRole('button', { name: 'The Vault' }).click()
    await expect(titleBox(page)).toHaveValue('Great recipe')
    await expect(page.getByLabel('Notes (optional)')).toHaveValue('https://example.com/soup')
  })
})
