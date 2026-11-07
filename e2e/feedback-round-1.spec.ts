import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { goTo } from './support/nav'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 8:00 pm.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T01:00:00Z')
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const lastWrite = (table: string) => server.written(table).at(-1)
const howOften = (scope: Page | ReturnType<Page['getByRole']>) => scope.getByRole('radiogroup', { name: 'How often' })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Every week or every 2 weeks', () => {
  test('a habit can repeat every 2 weeks', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await dialog.getByLabel('Title').fill('Water plants')
    await expect(howOften(dialog).getByRole('radio', { name: 'Every week' })).toHaveAttribute('aria-checked', 'true')
    await howOften(dialog).getByRole('radio', { name: 'Every 2 weeks' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('habits')).toMatchObject({ title: 'Water plants', week_interval: 2 })
  })

  test('a routine on chosen weekdays can repeat every 2 weeks', async ({ page }) => {
    await open(page, '/routines')
    await page.getByRole('button', { name: /New routine/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title', { exact: true }).fill('Deep clean')
    await howOften(dialog).getByRole('radio', { name: 'Every 2 weeks' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('routines')).toMatchObject({ title: 'Deep clean', week_interval: 2 })
  })

  test('a calendar event can repeat every 2 weeks', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: '+ New event' }).click()
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await dialog.getByLabel('Title').fill('Payday')
    await dialog.getByLabel('Repeat').selectOption({ label: 'Every 2 weeks' })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('events')).toMatchObject({ title: 'Payday', repeat: 'biweekly' })
  })
})

test.describe('Spec §5 Quick capture: Habit', () => {
  test('capture can add a habit with the full habit form', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('group', { name: 'What are you capturing?' }).getByRole('button', { name: 'Habit', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Floss')
    const days = page.getByRole('group', { name: 'Repeats on' })
    await expect(days.getByRole('button', { pressed: true })).toHaveCount(7)
    await days.getByRole('button', { name: 'Sun' }).click()
    await howOften(page).getByRole('radio', { name: 'Every 2 weeks' }).click()
    await page.getByLabel('Reminder time (optional)').fill('21:00')
    await page.getByRole('checkbox', { name: /Private/ }).check()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByTestId('capture-notice')).toHaveText('Added to your habits. Future you is building something.')
    await expect.poll(() => lastWrite('habits')).toMatchObject({
      title: 'Floss',
      weekdays: [1, 2, 3, 4, 5, 6],
      week_interval: 2,
      notify_time: '21:00',
      is_private: true,
    })
  })
})

test.describe('Spec §5 Orphans', () => {
  test('the inbox is called Orphans, and the old address still opens it', async ({ page }) => {
    await open(page, '/inbox')
    await expect(page).toHaveURL(/\/orphans$/)
    await expect(page.getByRole('heading', { name: 'Orphans', level: 1 })).toBeVisible()
  })
})

test.describe('Spec §5 Journal: tomorrow and better than yesterday', () => {
  test('"How to make tomorrow better?" is its own box, saved to the day', async ({ page }) => {
    await open(page, '/journal')
    const box = page.getByRole('textbox', { name: 'How to make tomorrow better?' })
    await box.click()
    await page.getByRole('toolbar', { name: 'Formatting: How to make tomorrow better?' }).getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('Lay out clothes tonight')
    await page.getByRole('heading', { name: 'Journal', level: 1 }).click()
    await expect
      .poll(() => server.written('journal_entries').find((e) => e.date === '2026-11-10' && e.tomorrow))
      .toMatchObject({ tomorrow: '<p><strong>Lay out clothes tonight</strong></p>' })
  })

  test('the better-than-yesterday question comes before the writing, and tomorrow comes after it', async ({ page }) => {
    await open(page, '/journal')
    const today = page.getByTestId('journal-today')
    const top = async (loc: ReturnType<Page['getByRole']>) => (await loc.boundingBox())!.y
    const better = await top(today.getByRole('radiogroup', { name: 'Was today better than yesterday?' }))
    const writing = await top(today.getByRole('textbox', { name: 'How the day went' }))
    const tomorrow = await top(today.getByRole('textbox', { name: 'How to make tomorrow better?' }))
    expect(better).toBeLessThan(writing)
    expect(writing).toBeLessThan(tomorrow)
  })

  test('Earlier entries show their tags across the top, and formatted tomorrow answers', async ({ page }) => {
    server.seed('journal_entries', [
      { id: 'j-9', date: '2026-11-09', body: '<p>Fine day</p>', tomorrow: '<p><strong>Sleep early</strong></p>', better_than_yesterday: true, stats: {}, auto: false, stats_final: true },
    ])
    server.seed('tags', [{ id: 't1', name: 'work' }, { id: 't2', name: 'family' }])
    server.seed('item_tags', [
      { id: 'it1', item_type: 'journal_entry', item_id: 'j-9', tag_id: 't1' },
      { id: 'it2', item_type: 'journal_entry', item_id: 'j-9', tag_id: 't2' },
    ])
    await open(page, '/journal')
    const entry = page.getByTestId('journal-entry-2026-11-09')
    await expect(entry.getByTestId('journal-entry-tag')).toHaveText(['#family', '#work'])
    await expect(entry.getByTestId('journal-tomorrow').locator('strong')).toHaveText('Sleep early')
    const tagsTop = (await entry.getByTestId('journal-entry-tags').boundingBox())!.y
    const bodyTop = (await entry.getByTestId('journal-body').boundingBox())!.y
    expect(tagsTop).toBeLessThan(bodyTop)
  })

  test('"Was today better than yesterday?" is answered Yes or No, and tapping again clears it', async ({ page }) => {
    await open(page, '/journal')
    const group = page.getByRole('radiogroup', { name: 'Was today better than yesterday?' })
    await group.getByRole('radio', { name: 'Yes' }).click()
    await expect(group.getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => lastWrite('journal_entries')).toMatchObject({ date: '2026-11-10', better_than_yesterday: true })
    await group.getByRole('radio', { name: 'No' }).click()
    await expect.poll(() => lastWrite('journal_entries')).toMatchObject({ better_than_yesterday: false })
    await group.getByRole('radio', { name: 'No' }).click()
    await expect.poll(() => lastWrite('journal_entries')).toMatchObject({ better_than_yesterday: null })
  })
})

test.describe('Spec §5 Dashboard: worst day and favorite buckets', () => {
  test('"Days since your worst day" counts the days in a row answered Yes', async ({ page }) => {
    const entry = (date: string, better: boolean | null) => ({ id: `j-${date}`, date, body: '', tomorrow: '', better_than_yesterday: better, stats: {}, auto: false, stats_final: true })
    server.seed('journal_entries', [entry('2026-11-06', false), entry('2026-11-07', true), entry('2026-11-08', true), entry('2026-11-09', true)])
    await open(page, '/')
    await expect(page.getByText('Days since your worst day')).toBeVisible()
    await expect(page.getByTestId('dash-worst-day')).toHaveText('3')
  })

  test('a starred bucket shows on the Dashboard with its 3 newest items and opens the bucket', async ({ page }) => {
    await open(page, '/vault')
    await page.getByRole('button', { name: /^Shopping list/ }).click()
    const add = page.getByRole('textbox', { name: 'Add to Shopping list' })
    for (const title of ['Milk', 'Eggs', 'Bread', 'Jam']) {
      await add.fill(title)
      await add.press('Enter')
      await page.clock.runFor(1000)
    }
    const star = page.getByRole('button', { name: 'Star Shopping list' })
    await star.click()
    await expect(page.getByRole('button', { name: 'Unstar Shopping list' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => server.written('vault_buckets').find((b) => b.name === 'Shopping list' && b.starred)).toBeTruthy()

    await goTo(page, 'Dashboard')
    const card = page.getByTestId('dash-favorite')
    await expect(card).toHaveCount(1)
    await expect(card.getByRole('listitem')).toHaveText(['Jam', 'Bread', 'Eggs'])
    await card.click()
    await expect(page.getByRole('textbox', { name: 'Add to Shopping list' })).toBeVisible()
  })

  test('an item can be deleted from the bucket list, after confirming', async ({ page }) => {
    server.seed('vault_buckets', [{ id: 'b-groc', name: 'Groceries', position: 9, checkable: false, starred: false }])
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'b-groc', title: 'Milk', notes: null, created_at: '2026-11-01T00:00:00Z' }])
    await open(page, '/vault?bucket=b-groc')
    await expect(page.getByTestId('vault-item')).toHaveText(['Milk'])
    await page.getByRole('button', { name: 'Delete Milk' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this item?' })
    await expect(confirm).toContainText('"Milk" will be deleted from Groceries on all your devices.')
    await confirm.getByRole('button', { name: 'Keep it' }).click()
    await expect(page.getByTestId('vault-item')).toHaveCount(1)
    await page.getByRole('button', { name: 'Delete Milk' }).click()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByTestId('vault-item')).toHaveCount(0)
    await expect.poll(() => lastWrite('vault_items')).toMatchObject({ id: 'v1', deleted_at: expect.any(String) })
  })

  test('with nothing starred there is no favorites section', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByTestId('dash-favorites')).toHaveCount(0)
  })
})

test.describe('Spec §7 Catching up and not leaving changes behind', () => {
  async function setVisibility(page: Page, state: 'hidden' | 'visible') {
    await page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  }

  test('switching away saves writing still waiting on its timer, straight away', async ({ page }) => {
    await open(page, '/journal')
    const editor = page.getByRole('textbox', { name: 'How the day went' })
    await editor.click()
    await page.keyboard.type('Written on the bus')
    // The clock is paused, so the save timer never runs by itself: only leaving the app can save it.
    await setVisibility(page, 'hidden')
    await expect.poll(() => server.written('journal_entries').at(-1)?.body).toBe('<p>Written on the bus</p>')
  })

  test('coming back to the app pulls what changed on other devices', async ({ page }) => {
    await open(page, '/journal')
    await expect(page.getByText("Past you let you down")).toBeVisible()
    server.seed('journal_entries', [{ id: 'j-9', date: '2026-11-09', body: '<p>From my phone</p>', stats: {}, auto: false, stats_final: true, updated_at: '2026-11-11T00:59:00Z' }])
    await setVisibility(page, 'hidden')
    await setVisibility(page, 'visible')
    await expect(page.getByTestId('journal-entry-2026-11-09')).toContainText('From my phone')
  })
})
