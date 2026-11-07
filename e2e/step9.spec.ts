import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { goTo } from './support/nav'

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
    await expect(page.getByTestId('vault-bucket')).toHaveText([/Shopping list\s*0 items/, /Restaurant reviews/, /Places to go/])
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

    await page.getByRole('button', { name: 'Clear checked' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Clear checked items?' })
    await expect(confirm).toContainText('Delete 1 checked item from Shopping list?')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByTestId('vault-item')).toHaveText(['Eggs', 'Bread'])
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ title: 'Milk', deleted_at: expect.any(String) })
  })

  test('an item can have a star rating, a link or address, notes and tags', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-1', title: 'Luigi’s', notes: null }])
    await open(page, '/vault?bucket=bucket-1')
    await page.getByRole('button', { name: 'Open Luigi’s' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit item' })
    await dialog.getByRole('radio', { name: '4 stars' }).click()
    await dialog.getByLabel('Link or address (optional)').fill('luigis.example.com/menu')
    await dialog.getByLabel('Notes (optional)').fill('Great carbonara')
    await dialog.getByRole('combobox', { name: 'Add a tag' }).fill('date night')
    await dialog.getByRole('combobox', { name: 'Add a tag' }).press('Enter')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ rating: 4, link: 'luigis.example.com/menu', notes: 'Great carbonara' })
    const item = page.getByTestId('vault-item')
    await expect(item.getByRole('img', { name: '4 of 5 stars' })).toBeVisible()
    await expect(item.getByRole('link', { name: 'Open link: luigis.example.com' })).toHaveAttribute('href', 'https://luigis.example.com/menu')
    expect(server.written('tags')).toEqual([expect.objectContaining({ name: 'date night' })])
    expect(server.written('item_tags')).toEqual([expect.objectContaining({ item_type: 'vault_item', item_id: 'v1' })])
  })

  test('an address opens in maps', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-2', title: 'Beach', link: '12 Ocean Ave, Santa Monica' }])
    await open(page, '/vault?bucket=bucket-2')
    await expect(page.getByRole('link', { name: 'Open in maps: 12 Ocean Ave, Santa Monica' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=12%20Ocean%20Ave%2C%20Santa%20Monica',
    )
  })

  test('buckets can be added, renamed, made into a checklist, and reordered', async ({ page }) => {
    await open(page, '/vault')
    await page.getByRole('button', { name: '+ New bucket' }).click()
    await page.getByRole('textbox', { name: 'Bucket name' }).fill('Books')
    await page.getByRole('button', { name: 'Add bucket' }).click()
    await expect(page.getByTestId('vault-bucket')).toHaveCount(4)
    await page.getByRole('button', { name: 'Move Books up' }).click()
    await expect(page.getByTestId('vault-bucket').nth(2)).toContainText('Books')

    await page.getByRole('button', { name: /^Books/ }).click()
    await page.getByRole('button', { name: 'Bucket settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Bucket settings' })
    await dialog.getByLabel('Name').fill('Books to read')
    await dialog.getByRole('checkbox', { name: /Items can be checked off/ }).check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Books to read', level: 1 })).toBeVisible()
    await expect.poll(() => lastWrite('vault_buckets')).toMatchObject({ name: 'Books to read', checkable: true })
  })

  test('deleting a bucket says how many items go with it, then deletes them', async ({ page }) => {
    server.seed('vault_items', [
      { id: 'v1', bucket_id: 'bucket-2', title: 'Beach' },
      { id: 'v2', bucket_id: 'bucket-2', title: 'Museum' },
    ])
    await open(page, '/vault?bucket=bucket-2')
    await page.getByRole('button', { name: 'Bucket settings' }).click()
    await page.getByRole('dialog', { name: 'Bucket settings' }).getByRole('button', { name: 'Delete bucket' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this bucket?' })
    await expect(confirm).toContainText('"Places to go" and its 2 items will be deleted from all your devices.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
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
    server.seed('item_tags', [{ id: 'it1', tag_id: 'tag-food', item_type: 'vault_item', item_id: 'v1' }])
  }
  async function openSearch(page: Page) {
    const header = page.getByRole('banner').getByRole('button', { name: 'Search' })
    if (await header.isVisible()) await header.click()
    else await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Search' }).click()
    return page.getByRole('dialog', { name: 'Search' })
  }

  test('search opens over the page and finds items of every type, ignoring case and accents', async ({ page }) => {
    seedSearchable()
    await open(page, '/habits')
    const dialog = await openSearch(page)
    await expect(page).toHaveURL(/\/habits$/)
    await dialog.getByRole('searchbox', { name: 'Search everything' }).fill('CAFE')
    await expect(dialog.getByTestId('results-task')).toContainText('Book café table')
    await expect(dialog.getByTestId('results-vault_item')).toContainText('Luigi’s')
    await expect(dialog.getByTestId('results-vault_item')).toContainText('Restaurant reviews')
    await dialog.getByRole('searchbox', { name: 'Search everything' }).fill('zebra')
    await expect(dialog.getByRole('status')).toHaveText("Past you didn't leave anything matching that.")
  })

  test('tapping a result opens it where it lives', async ({ page }) => {
    seedSearchable()
    await open(page, '/')
    let dialog = await openSearch(page)
    await dialog.getByRole('searchbox', { name: 'Search everything' }).fill('luigi')
    await dialog.getByTestId('search-result').click()
    await expect(page).toHaveURL(/\/vault\?bucket=bucket-1/)
    await expect(page.getByRole('dialog', { name: 'Edit item' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Edit item' }).getByRole('button', { name: 'Close' }).click()

    dialog = await openSearch(page)
    await dialog.getByRole('searchbox', { name: 'Search everything' }).fill('cafe table')
    await dialog.getByTestId('search-result').click()
    await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Edit task' }).getByLabel('Title')).toHaveValue('Book café table')
  })

  test('results can be filtered by tag, and a tag alone lists everything with it', async ({ page }) => {
    seedSearchable()
    await open(page, '/')
    const dialog = await openSearch(page)
    await dialog.getByRole('button', { name: '#food' }).click()
    await expect(dialog.getByTestId('search-result')).toHaveCount(1)
    await expect(dialog.getByTestId('search-result')).toContainText('Luigi’s')
    await dialog.getByRole('searchbox', { name: 'Search everything' }).fill('cafe')
    await expect(dialog.getByTestId('search-result')).toHaveCount(1)
  })

  test('tags can be added to a task, and to a quest', async ({ page }) => {
    server.seed('tasks', [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Pay rent', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' }])
    await open(page, '/')
    await page.getByRole('button', { name: /^Pay rent/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    await dialog.getByRole('combobox', { name: 'Add a tag' }).fill('money')
    await dialog.getByRole('combobox', { name: 'Add a tag' }).press('Enter')
    await expect(dialog.getByTestId('tag-chip')).toHaveText(/#money/)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('item_tags').length).toBe(1)
    expect(server.written('item_tags')[0]).toMatchObject({ item_type: 'task', item_id: 'aaaaaaaa-0000-4000-8000-000000000001' })
    expect(server.written('tags')[0]).toMatchObject({ name: 'money' })
  })
})

test.describe('Spec §5 Calendar', () => {
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
    await page.getByRole('button', { name: '+ New event' }).click()
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await dialog.getByLabel('Title').fill('Team lunch')
    await dialog.getByRole('checkbox', { name: 'All day' }).uncheck()
    await dialog.getByLabel('Starts Time').fill('12:30')
    await dialog.getByLabel('Ends Time').fill('13:30')
    await dialog.getByLabel('Repeat').selectOption({ label: 'Every week' })
    await dialog.getByLabel('Reminder').selectOption({ label: '15 minutes before' })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => lastWrite('events')).toMatchObject({
      title: 'Team lunch',
      start_date: '2026-11-10',
      start_time: '12:30',
      end_time: '13:30',
      repeat: 'weekly',
      reminder_minutes: 15,
    })
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await expect(page.locator('.cal-wrap').getByText('Team lunch')).toBeVisible()
  })

  test('an event needs a title and must end after it starts', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: '+ New event' }).click()
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Give it a title so future you knows what it is.')
    await dialog.getByLabel('Title').fill('Oops')
    await dialog.getByRole('checkbox', { name: 'All day' }).uncheck()
    await dialog.getByLabel('Starts Time').fill('15:00')
    await dialog.getByLabel('Ends Time').fill('14:00')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('It needs to end after it starts.')
    expect(server.written('events')).toHaveLength(0)
  })

  test('tapping an event opens it; deleting a repeating event asks first and deletes the series', async ({ page }) => {
    server.seed('events', [
      { id: 'e2', title: 'Standup', notes: null, start_date: '2026-11-02', start_time: '09:30:00', end_date: '2026-11-02', end_time: '09:45:00', repeat: 'weekdays', reminder_minutes: null },
    ])
    await open(page, '/calendar')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await page.locator('.cal-wrap').getByText('Standup').click()
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await expect(dialog.getByLabel('Title')).toHaveValue('Standup')
    await dialog.getByRole('button', { name: 'Delete event' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this event?' })
    await expect(confirm).toContainText('"Standup" and every repeat will be deleted from all your devices.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect.poll(() => lastWrite('events')).toMatchObject({ id: 'e2', deleted_at: expect.any(String) })
    await expect(page.locator('.cal-wrap').getByText('Standup')).toHaveCount(0)
  })

  test('tapping a task opens it on the Tasks page', async ({ page }) => {
    seedCalendar()
    await open(page, '/calendar')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await page.locator('.cal-wrap').getByText('Pay rent').click()
    await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  })

  test('a reminder or search result can open the calendar on a day, with the event open', async ({ page }) => {
    seedCalendar()
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await expect(page.getByRole('dialog', { name: 'Edit event' }).getByLabel('Title')).toHaveValue('Dentist')
  })

  test('an empty day says so', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await expect(page.getByTestId('calendar-empty')).toHaveText('Nothing planned. Past you left today open.')
  })
})
