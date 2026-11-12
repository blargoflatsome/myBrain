import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { goTo } from '../support/nav'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
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

test.describe('Spec §5 The Vault', () => {
  test('the Vault lists my buckets; inside one I can add items and check them off', async ({ page }) => {
    await open(page, '/')
    await goTo(page, 'The Vault')
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Places to go/, /Restaurant reviews/, /Shopping list\s*0 items/])
    await page.getByRole('button', { name: /^Shopping list/ }).click()
    await expect(page.getByText("Past you hasn't put anything in here yet.")).toBeVisible()

    const add = page.getByRole('textbox', { name: 'Add to Shopping list' })
    for (const title of ['Milk', 'Eggs', 'Bread']) {
      await add.fill(title)
      await add.press('Enter')
    }
    await expect(page.getByTestId('vault-item')).toHaveText(['Milk', 'Eggs', 'Bread'])
    await page.getByRole('checkbox', { name: 'Check off Milk' }).click()
    await expect(page.getByTestId('vault-item')).toHaveText(['Eggs', 'Bread', /Milk/])
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ title: 'Milk', checked: true })

    await page.getByRole('button', { name: msg.vault.clearChecked }).click()
    await expect(page.getByTestId('vault-item')).toHaveText(['Eggs', 'Bread'])
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.clearedChecked(1))
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ title: 'Milk', deleted_at: expect.any(String) })
  })

  test('an item can have a star rating, a link or address and notes (no tags)', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-1', title: 'Luigi’s', notes: null }])
    await open(page, '/vault?bucket=bucket-1')
    await page.getByRole('button', { name: 'Open Luigi’s' }).click()
    const dialog = page.getByRole('dialog', { name: msg.vault.itemEditor.heading })
    await dialog.getByText(msg.forms.moreOptions).click()
    await dialog.getByRole('radio', { name: '4 stars' }).click()
    await dialog.getByLabel(msg.vault.itemEditor.link).fill('luigis.example.com/menu')
    await dialog.getByRole('textbox', { name: msg.capture.notesLabel }).fill('Great carbonara')
    await expect(dialog.getByRole('combobox', { name: msg.tags.add })).toHaveCount(0)
    await dialog.getByRole('button', { name: msg.capture.save }).click()

    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ rating: 4, link: 'luigis.example.com/menu', notes: '<p>Great carbonara</p>' })
    const item = page.getByTestId('vault-item')
    await expect(item.getByRole('img', { name: '4 of 5 stars' })).toBeVisible()
    await expect(item.getByRole('link', { name: 'Open link: luigis.example.com' })).toHaveAttribute('href', 'https://luigis.example.com/menu')
  })

  test('an address opens in maps', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-2', title: 'Beach', link: '12 Ocean Ave, Santa Monica' }])
    await open(page, '/vault?bucket=bucket-2')
    await expect(page.getByRole('link', { name: 'Open in maps: 12 Ocean Ave, Santa Monica' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=12%20Ocean%20Ave%2C%20Santa%20Monica',
    )
  })

  test('buckets can be added (taking their place A to Z), renamed and made into a checklist', async ({ page }) => {
    await open(page, '/vault')
    await page.getByRole('button', { name: msg.vault.newBucket }).click()
    await page.getByRole('textbox', { name: msg.vault.newBucketName }).fill('Books')
    await page.getByRole('button', { name: msg.vault.createBucket }).click()
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Books/, /Places to go/, /Restaurant reviews/, /Shopping list/])

    await page.getByRole('button', { name: /^Books/ }).click()
    await page.getByRole('button', { name: msg.vault.settings }).click()
    const dialog = page.getByRole('dialog', { name: msg.vault.settings })
    await dialog.getByLabel(msg.tagsPage.editor.name).fill('Books to read')
    await dialog.getByRole('checkbox', { name: /Items can be checked off/ }).check()
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByRole('heading', { name: 'Books to read', level: 1 })).toBeVisible()
    await expect.poll(() => lastWrite('vault_buckets')).toMatchObject({ name: 'Books to read', checkable: true })
  })

  test('buckets are always favorites first, then A to Z, with nothing to drag', async ({ page }) => {
    server.seed('vault_buckets', [{ id: 'b-z', name: 'Zoo trips', position: 9, checkable: false, starred: true }])
    await open(page, '/vault')
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Zoo trips/, /Places to go/, /Restaurant reviews/, /Shopping list/])
    await expect(page.getByRole('button', { name: /^Reorder/ })).toHaveCount(0)
    // Starring one moves it up with the favorites.
    await page.getByRole('button', { name: /^Shopping list/ }).click()
    await page.getByRole('button', { name: 'Star Shopping list' }).click()
    await expect(page.getByRole('button', { name: 'Unstar Shopping list' })).toBeVisible()
    await expect.poll(() => server.written('vault_buckets').some((b) => b.name === 'Shopping list' && b.starred)).toBe(true)
    await page.goto('/vault')
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Shopping list/, /Zoo trips/, /Places to go/, /Restaurant reviews/])
  })


  test('deleting a bucket says how many items go with it, then deletes them', async ({ page }) => {
    server.seed('vault_items', [
      { id: 'v1', bucket_id: 'bucket-2', title: 'Beach' },
      { id: 'v2', bucket_id: 'bucket-2', title: 'Museum' },
    ])
    await open(page, '/vault?bucket=bucket-2')
    await page.getByRole('button', { name: msg.vault.settings }).click()
    await page.getByRole('dialog', { name: msg.vault.settings }).getByRole('button', { name: msg.vault.bucketEditor.delete }).click()
    const confirm = page.getByRole('alertdialog', { name: msg.vault.confirmBucketDelete.heading })
    await expect(confirm).toContainText('"Places to go" and its 2 items will be deleted from all your devices.')
    await confirm.getByRole('button', { name: msg.vault.confirmClear.confirm }).click()
    await expect(page.getByTestId('vault-bucket')).toHaveCount(2)
    await expect.poll(() => server.written('vault_items').filter((i) => i.deleted_at).length).toBe(2)
    await expect.poll(() => lastWrite('vault_buckets')).toMatchObject({ id: 'bucket-2', deleted_at: expect.any(String) })
  })
})

test.describe('Spec §5 Global search and tags', () => {
  function seedSearchable() {
    server.seed('tasks', [{ id: 't1', title: 'Book café table', notes: 'for Sam', due_date: '2026-11-12', priority: 1, status: 'open', source: 'manual' }])
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-1', title: 'Luigi’s', notes: 'Best cafe in town' }])
    server.seed('quests', [{ id: 'q1', title: 'Learn to bake', status: 'open' }])
    server.seed('tags', [{ id: 'tag-food', name: 'food' }])
    server.seed('item_tags', [{ id: 'it1', tag_id: 'tag-food', item_type: 'task', item_id: 't1' }])
  }
  async function openSearch(page: Page) {
    const header = page.getByRole('banner').getByRole('button', { name: msg.nav.search })
    if (await header.isVisible()) await header.click()
    else await page.getByRole('navigation', { name: msg.nav.label }).getByRole('button', { name: msg.nav.search }).click()
    return page.getByRole('dialog', { name: msg.nav.search })
  }

  test('search opens over the page and finds items of every type, ignoring case and accents', async ({ page }) => {
    seedSearchable()
    await open(page, '/habits')
    const dialog = await openSearch(page)
    await expect(page).toHaveURL(/\/habits$/)
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('CAFE')
    await expect(dialog.getByTestId('results-task')).toContainText('Book café table')
    await expect(dialog.getByTestId('results-vault_item')).toContainText('Luigi’s')
    await expect(dialog.getByTestId('results-vault_item')).toContainText('Restaurant reviews')
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('zebra')
    await expect(dialog.getByRole('status')).toHaveText("I can't find anything matching that.")
  })

  test('tapping a result opens it where it lives', async ({ page }) => {
    seedSearchable()
    await open(page, '/')
    let dialog = await openSearch(page)
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('luigi')
    await dialog.getByTestId('search-result').click()
    await expect(page).toHaveURL(/\/vault\?bucket=bucket-1/)
    await expect(page.getByRole('dialog', { name: msg.vault.itemEditor.heading })).toBeVisible()
    await page.getByRole('dialog', { name: msg.vault.itemEditor.heading }).getByRole('button', { name: msg.share.close }).first().click()

    dialog = await openSearch(page)
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('cafe table')
    await dialog.getByTestId('search-result').click()
    await expect(page.getByRole('dialog', { name: msg.tasks.editor.heading })).toBeVisible()
    await expect(page.getByRole('dialog', { name: msg.tasks.editor.heading }).getByLabel(msg.capture.titleLabel)).toHaveValue('Book café table')
  })

  test('results can be filtered by tag, and a tag alone lists everything with it', async ({ page }) => {
    seedSearchable()
    await open(page, '/')
    const dialog = await openSearch(page)
    await dialog.getByRole('button', { name: '#food' }).click()
    await expect(dialog.getByTestId('search-result')).toHaveCount(1)
    await expect(dialog.getByTestId('search-result')).toContainText('Book café table')
    await dialog.getByRole('searchbox', { name: msg.search.placeholder }).fill('cafe')
    await expect(dialog.getByTestId('search-result')).toHaveCount(1)
  })

  test('tags can be added to a task', async ({ page }) => {
    server.seed('tasks', [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Pay rent', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' }])
    await open(page, '/tasks')
    await page.getByRole('button', { name: /^Pay rent/ }).click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await dialog.getByText(msg.forms.moreOptions).click()
    await dialog.getByRole('combobox', { name: msg.tags.add }).fill('money')
    await dialog.getByRole('combobox', { name: msg.tags.add }).press('Enter')
    await expect(dialog.getByTestId('tag-chip')).toHaveText(/#money/)
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => server.written('item_tags').length).toBe(1)
    expect(server.written('item_tags')[0]).toMatchObject({ item_type: 'task', item_id: 'aaaaaaaa-0000-4000-8000-000000000001' })
    expect(server.written('tags')[0]).toMatchObject({ name: 'money' })
  })
})

test.describe('Spec §5 Calendar', { tag: '@phone' }, () => {
  function seedCalendar() {
    server.seed('tasks', [{ id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 3, status: 'open', source: 'manual' }])
    server.seed('priority_tasks', [{ id: 'p1', title: 'Insulin', reminder_time: '12:00:00', due_date: null, weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-01' }])
    server.seed('events', [
      { id: 'e1', title: 'Dentist', notes: null, start_date: '2026-11-10', start_time: '15:00:00', end_date: '2026-11-10', end_time: '16:00:00', repeat: 'never', reminder_minutes: 30 },
    ])
  }

  test('the calendar shows dated tasks, priority tasks and my events, in month, week and day views', async ({ page }) => {
    seedCalendar()
    await open(page, '/')
    await goTo(page, 'Calendar')
    for (const view of ['Month', 'Week', 'Day']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      const cal = page.locator('.cal-wrap')
      await expect(cal.getByText('Pay rent')).toBeVisible()
      await expect(cal.getByText('Insulin').first()).toBeVisible()
      await expect(cal.getByText('Dentist')).toBeVisible()
    }
    await expect(page.getByTestId('calendar-title')).toHaveText('November 10, 2026')
  })

  test('a new event is saved with its time, repeat and reminder', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    await dialog.getByLabel(msg.capture.titleLabel).fill('Team lunch')
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await dialog.getByLabel('Starts Time').fill('12:30')
    await dialog.getByLabel('Ends Time').fill('13:30')
    await dialog.getByLabel(msg.calendar.editor.repeat).selectOption({ label: 'Every week' })
    await dialog.getByLabel(msg.calendar.editor.reminder).selectOption({ label: '15 minutes before' })
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => lastWrite('events')).toMatchObject({
      title: 'Team lunch',
      start_date: '2026-11-10',
      start_time: '12:30',
      end_time: '13:30',
      repeat: 'weekly',
      reminder_minutes: 15,
    })
    await page.getByRole('button', { name: msg.availability.day, exact: true }).click()
    await expect(page.locator('.cal-wrap').getByText('Team lunch')).toBeVisible()
  })

  test('an event needs a title and must end after it starts', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog.getByRole('alert')).toHaveText(msg.calendar.editor.titleError)
    await dialog.getByLabel(msg.capture.titleLabel).fill('Oops')
    await dialog.getByRole('checkbox', { name: msg.availability.allDay }).uncheck()
    await dialog.getByLabel('Starts Time').fill('15:00')
    await dialog.getByLabel('Ends Time').fill('14:00')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog.getByRole('alert')).toHaveText(msg.calendar.editor.endError)
    expect(server.written('events')).toHaveLength(0)
  })

  test('tapping an event opens it; deleting a repeating event with no guests deletes the series, with Undo', async ({ page }) => {
    server.seed('events', [
      { id: 'e2', title: 'Standup', notes: null, start_date: '2026-11-02', start_time: '09:30:00', end_date: '2026-11-02', end_time: '09:45:00', repeat: 'weekdays', reminder_minutes: null },
    ])
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.availability.day, exact: true }).click()
    await page.locator('.cal-wrap').getByText('Standup').click()
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await expect(dialog.getByLabel(msg.capture.titleLabel)).toHaveValue('Standup')
    await dialog.getByRole('button', { name: msg.calendar.editor.delete }).click()
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.deleted('Standup'))
    await expect.poll(() => lastWrite('events')).toMatchObject({ id: 'e2', deleted_at: expect.any(String) })
    await expect(page.locator('.cal-wrap').getByText('Standup')).toHaveCount(0)
  })

  test('a reminder or search result can open the calendar on a day, with the event open', async ({ page }) => {
    seedCalendar()
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await expect(page.getByTestId('calendar-item').getByRole('heading', { name: 'Dentist' })).toBeVisible()
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
    await expect(page.getByRole('dialog', { name: msg.calendar.editor.heading }).getByLabel(msg.capture.titleLabel)).toHaveValue('Dentist')
  })

  test('an empty day says so', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.availability.day, exact: true }).click()
    await expect(page.getByTestId('calendar-empty')).toHaveText(msg.calendar.emptyDay)
  })
})
