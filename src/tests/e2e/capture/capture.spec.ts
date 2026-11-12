import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

const typeGroup = (page: Page) => page.getByRole('group', { name: msg.capture.whereHeading })
const titleBox = (page: Page) => page.getByLabel(msg.capture.titleLabel, { exact: true })
const laterBox = (page: Page) => page.getByLabel(msg.capture.placeholder)
const save = (page: Page) => page.getByTestId('capture-save')

/** Open capture and choose a type. */
async function startCapture(page: Page, type: 'Task' | 'The Vault' | 'Quest') {
  await page.goto('/capture')
  await typeGroup(page).getByRole('button', { name: type, exact: true }).click()
}

test.describe('Spec §5 Quick capture: the text box first', () => {
  test('a persistent Capture button opens capture over the current page, with the text box focused and Decide later chosen', async ({ page }) => {
    await page.goto('/habits')
    await page.getByRole('button', { name: '+ Capture' }).click()
    const dialog = page.getByRole('dialog', { name: msg.capture.windowLabel })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/habits$/)
    await expect(laterBox(page)).toBeFocused()
    await expect(typeGroup(page).getByRole('button')).toHaveText(['Task', 'The Vault', 'Quest', 'Habit', 'Post It', 'Decide later'])
    await expect(typeGroup(page).getByRole('button', { name: msg.capture.destinations.later })).toHaveAttribute('aria-pressed', 'true')
  })

  test('the Capture window saves without leaving the page, and closing it returns to the page', async ({ page }) => {
    await page.goto('/habits')
    await page.getByRole('button', { name: '+ Capture' }).click()
    const dialog = page.getByRole('dialog', { name: msg.capture.windowLabel })
    await typeGroup(page).getByRole('button', { name: msg.capture.destinations.task, exact: true }).click()
    await dialog.getByLabel(msg.capture.titleLabel, { exact: true }).fill('buy stamps')
    await dialog.getByTestId('capture-save').click()
    await expect(dialog.getByTestId('capture-notice')).toHaveText(msg.capture.saved.taskUndated)
    await expect(page).toHaveURL(/\/habits$/)
    await dialog.getByRole('button', { name: msg.capture.close }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: msg.nav.habits, level: 1 })).toBeVisible()
    expect(server.written('tasks')[0]).toMatchObject({ title: 'buy stamps', source: 'capture' })
  })

  test('Escape closes the Capture window', async ({ page }) => {
    await page.goto('/habits')
    await page.getByRole('button', { name: '+ Capture' }).click()
    await expect(page.getByRole('dialog', { name: msg.capture.windowLabel })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: msg.capture.windowLabel })).toBeHidden()
  })

  test('choosing a type keeps what I typed: the first line is the title, the rest the notes', async ({ page }) => {
    await page.goto('/capture')
    await laterBox(page).fill('call the plumber\nask about the leak under the sink')
    await typeGroup(page).getByRole('button', { name: msg.capture.destinations.task, exact: true }).click()
    await expect(titleBox(page)).toHaveValue('call the plumber')
    await expect(page.getByRole('textbox', { name: msg.capture.notesLabel })).toHaveText('ask about the leak under the sink')
    // Back to Decide later, nothing is lost either.
    await typeGroup(page).getByRole('button', { name: msg.capture.destinations.later }).click()
    await expect(laterBox(page)).toHaveValue('call the plumber\nask about the leak under the sink')
  })

  test('only the title is required: an empty title is not saved', async ({ page }) => {
    await startCapture(page, 'Quest')
    await save(page).click()
    await expect(page.getByRole('alert')).toHaveText(msg.capture.emptyError)
    expect(server.writes).toHaveLength(0)
  })
})

test.describe('Spec §5 Quick capture: Task form', () => {
  test('title only: saved as Low priority to the Undated list', async ({ page }) => {
    await startCapture(page, 'Task')
    await titleBox(page).fill('call the plumber')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.taskUndated)
    await expect.poll(() => server.written('tasks')).toEqual([
      expect.objectContaining({ title: 'call the plumber', notes: null, due_date: null, priority: 1, source: 'capture' }),
    ])
  })

  test('notes, date and priority are saved', async ({ page }) => {
    await startCapture(page, 'Task')
    await titleBox(page).fill('dentist')
    await page.getByRole('textbox', { name: msg.capture.notesLabel }).fill('bring insurance card')
    await page.getByLabel(msg.capture.taskDateLabel).fill('2026-11-09')
    await page.getByRole('group', { name: msg.journal.priority }).getByRole('button', { name: msg.tasks.priority.high }).click()
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.task)
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({
      notes: '<p>bring insurance card</p>',
      due_date: '2026-11-09',
      priority: 3,
    })
  })
})

test.describe('Spec §5 Quick capture: The Vault form', () => {
  test('the first bucket is preselected, so only the title is needed', async ({ page }) => {
    await startCapture(page, 'The Vault')
    const buckets = page.getByRole('group', { name: msg.capture.bucketLabel })
    // Buckets are listed A to Z (favorites would come first); the first one is preselected.
    await expect(buckets.getByRole('button')).toHaveText(['Places to go', 'Restaurant reviews', 'Shopping list', '+ New bucket'])
    await expect(buckets.getByRole('button', { name: 'Places to go' })).toHaveAttribute('aria-pressed', 'true')
    // SPEC §2 Calm by design: a chosen option shows a check mark and a space before its name, nothing else.
    const mark = await buckets.getByRole('button', { name: 'Places to go' }).evaluate((el) => getComputedStyle(el, '::before').content)
    expect(mark.startsWith('"✓ "')).toBe(true)
    await titleBox(page).fill('Beach day')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.vault('Places to go'))
    await expect.poll(() => server.written('vault_items')[0]).toMatchObject({ title: 'Beach day', bucket_id: 'bucket-2' })
  })

  test('with more than 10 buckets the choice is a dropdown, with New bucket last (SPEC §5 Forms)', async ({ page }) => {
    server.seed('vault_buckets', Array.from({ length: 11 }, (_, i) => ({ id: `b${i}`, name: `Bucket ${String(i).padStart(2, '0')}`, position: i, checkable: false })))
    await startCapture(page, 'The Vault')
    const choice = page.getByRole('combobox', { name: msg.capture.bucketLabel })
    await expect(choice).toHaveValue('b0')
    await choice.selectOption({ label: `+ ${msg.capture.newBucket}` })
    await page.getByRole('textbox', { name: msg.capture.newBucket }).fill('Gift ideas')
    await titleBox(page).fill('Board game')
    await save(page).click()
    await expect.poll(() => server.written('vault_buckets').at(-1)?.name).toBe('Gift ideas')
    await expect.poll(() => server.written('vault_items')[0]?.bucket_id).toBe(server.written('vault_buckets').at(-1)?.id)
  })

  test('rating and link are in More details, as in the item editor', async ({ page }) => {
    await startCapture(page, 'The Vault')
    // The buckets have downloaded and the first is preselected.
    await expect(page.getByRole('group', { name: msg.capture.bucketLabel }).getByRole('button', { name: 'Places to go' })).toHaveAttribute('aria-pressed', 'true')
    await titleBox(page).fill('Luigi’s')
    await page.getByTestId('vault-more').getByText(msg.forms.moreOptions).click()
    await page.getByRole('radio', { name: msg.vault.itemEditor.ratingStar(4) }).click()
    await page.getByLabel(msg.vault.itemEditor.link).fill('luigis.example.com')
    await save(page).click()
    await expect.poll(() => server.written('vault_items')[0]).toMatchObject({ title: 'Luigi’s', rating: 4, link: 'luigis.example.com' })
  })

  test('another bucket and notes can be chosen', async ({ page }) => {
    await startCapture(page, 'The Vault')
    await page.getByRole('group', { name: msg.capture.bucketLabel }).getByRole('button', { name: 'Restaurant reviews' }).click()
    await titleBox(page).fill('Thai Garden')
    await page.getByRole('textbox', { name: msg.capture.notesLabel }).fill('try the green curry')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.vault('Restaurant reviews'))
    await expect.poll(() => server.written('vault_items')[0]).toMatchObject({ bucket_id: 'bucket-1', notes: '<p>try the green curry</p>' })
  })

  test('a new bucket can be made from the form', async ({ page }) => {
    await startCapture(page, 'The Vault')
    await page.getByRole('button', { name: msg.vault.newBucket }).click()
    await page.getByRole('textbox', { name: msg.capture.newBucket }).fill('Books')
    await titleBox(page).fill('Piranesi')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.vault('Books'))
    await expect.poll(() => server.written('vault_buckets').map((b) => b.name)).toEqual(['Books'])
    await expect.poll(() => server.written('vault_items')[0]?.title).toBe('Piranesi')
  })
})

test.describe('Spec §5 Quick capture: Quest form', () => {
  test('shows Title, Energy needed, Time needed and Details all in view (no More details); defaults are Ugh and 30 min', async ({ page }) => {
    await startCapture(page, 'Quest')
    await expect(page.getByTestId('capture-more')).toHaveCount(0)
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: msg.capture.detailsLabel })).toBeVisible()
    await expect(page.getByRole('group', { name: msg.quests.editor.energy }).getByRole('button', { name: msg.quests.energy.ugh })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: msg.quests.editor.time }).getByRole('button', { name: msg.quests.time["30m"] })).toHaveAttribute('aria-pressed', 'true')
    await titleBox(page).fill('build a birdhouse')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.quest)
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
    await page.getByRole('textbox', { name: msg.capture.detailsLabel }).fill('rent at the dock')
    await page.getByRole('group', { name: msg.quests.editor.energy }).getByRole('button', { name: msg.quests.energy.medicated }).click()
    await page.getByRole('group', { name: msg.quests.editor.time }).getByRole('button', { name: msg.quests.time.half_day }).click()
    await save(page).click()
    await expect.poll(() => server.written('quests')[0]).toMatchObject({
      details: '<p>rent at the dock</p>',
      energy_level: 'medicated',
      time_bucket: 'half_day',
    })
  })
})

test.describe('Spec §5: Decide later, then sort it when I have time', () => {
  test('Decide later saves the text to Orphans, and filing it as a Quest gives Ugh / 30 min', async ({ page }) => {
    // No chip chosen: Save goes to Orphans.
    await page.goto('/capture')
    await laterBox(page).fill('maybe learn Portuguese')
    await save(page).click()
    await expect(page.getByTestId('capture-notice')).toHaveText(msg.capture.saved.later)

    await goTo(page, /Orphans/)
    await expect(page.getByText(msg.inbox.itemPrompt)).toBeVisible()
    await page.getByRole('button', { name: msg.capture.destinations.quest }).click()
    await expect(page.getByTestId('orphans-sorted')).toHaveText(msg.celebrations.orphansSorted)
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
    await expect(page.getByTestId('sync-indicator')).toHaveText(msg.sync.online)

    await context.setOffline(true)
    await laterBox(page).fill('idea on the subway')
    await save(page).click()

    await expect(page.getByTestId('capture-notice')).toHaveText("Saved on this device. It'll sync when you're back online.")
    await expect(page.getByTestId('sync-indicator')).toHaveText(`${msg.sync.offline} · ${msg.sync.pending(1)}`)
    expect(server.written('inbox')).toHaveLength(0)

    await context.setOffline(false)
    await expect(page.getByTestId('sync-indicator')).toHaveText(msg.sync.online)
    await expect.poll(() => server.written('inbox')[0]?.body).toBe('idea on the subway')
  })

  test('the installed app opens with no connection (service worker)', async ({ page, context }) => {
    test.skip(test.info().project.name === 'iphone', 'service workers are off in the iPhone test profile')
    await page.goto('/capture')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: msg.capture.typeHeading })).toBeVisible()
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

  test('shared text fills the box, and choosing a type splits it into title and notes', async ({ page }) => {
    await page.goto('/capture?title=Great%20recipe&text=https%3A%2F%2Fexample.com%2Fsoup')
    await expect(laterBox(page)).toHaveValue('Great recipe\nhttps://example.com/soup')
    await expect(page).toHaveURL(/\/capture$/)
    await typeGroup(page).getByRole('button', { name: msg.capture.destinations.vault }).click()
    await expect(titleBox(page)).toHaveValue('Great recipe')
    await expect(page.getByRole('textbox', { name: msg.capture.notesLabel })).toHaveText('https://example.com/soup')
  })
})
