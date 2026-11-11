import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// SPEC §2 Calm by design and Confirm before impact; undo for the rest. New York, Tue Nov 10 2026, 9:20 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:20:00Z')
const DAY = '2026-11-10'
const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const bar = (page: Page) => page.getByTestId('undo-bar')
const task = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z', ...extra })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §2: one thing goes straight away, with Undo', () => {
  test('deleting a task needs no confirmation; Undo brings it back', async ({ page }) => {
    server.seed('tasks', [task('t1', LONG_LINE)])
    await open(page, '/tasks')
    await page.getByText(LONG_LINE).click()
    await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Delete task' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByTestId('task-title')).toHaveCount(0)
    await expect(bar(page).getByTestId('undo-message')).toHaveText(`Deleted "${LONG_LINE}"`)
    await page.setViewportSize({ width: 320, height: 700 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await bar(page).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByTestId('task-title')).toHaveText([LONG_LINE])
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', deleted_at: null })
  })

  test('the Undo bar goes away after 8 seconds', async ({ page }) => {
    server.seed('tasks', [task('t1', 'pay rent')])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Delete task' }).click()
    await expect(bar(page).getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.clock.runFor(8_100)
    await expect(bar(page).getByRole('button', { name: 'Undo' })).toHaveCount(0)
  })

  test('Clear crossed-off can be undone', async ({ page }) => {
    server.seed('tasks', [task('t1', 'pay rent', { status: 'done', completed_at: '2026-11-10T14:00:00Z' })])
    await open(page, '/tasks')
    await page.getByTestId('clear-done').click()
    await expect(page.getByTestId('task-title')).toHaveCount(0)
    await expect(bar(page).getByTestId('undo-message')).toHaveText('Cleared 1 crossed-off task')
    await bar(page).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['pay rent'])
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', cleared_at: null, status: 'done' })
  })

  test('marking a quest done can be undone: the completion comes off the log', async ({ page }) => {
    server.seed('quests', [{ id: 'q1', title: 'Paint the fence', status: 'accepted', times_picked: 1 }])
    await open(page, '/quests')
    await page.getByRole('button', { name: 'Mark done: Paint the fence' }).click()
    await expect(bar(page).getByTestId('undo-message')).toHaveText('Marked "Paint the fence" done')
    await bar(page).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible()
    await expect.poll(() => server.written('quest_logs').at(-1)?.deleted_at).toBeTruthy()
    await expect.poll(() => server.written('quests').at(-1)).toMatchObject({ id: 'q1', status: 'accepted' })
  })

  test('an event with people invited still asks first', async ({ page }) => {
    server.seed('events', [{ id: 'e1', title: 'Party', notes: null, start_date: DAY, start_time: '19:00', end_date: DAY, end_time: '21:00', repeat: 'never', reminder_minutes: null }])
    server.seed('event_invites', [{ id: 'i1', event_id: 'e1', host_name: 'Test Person', name: 'Pat', email: null, phone: '5550109000', response: 'pending' }])
    await open(page, `/calendar?date=${DAY}&event=e1`)
    await page.getByTestId('calendar-item').getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Delete event' }).click()
    await expect(page.getByRole('alertdialog', { name: 'Delete this event?' })).toBeVisible()
  })
})

test.describe('Spec §2 Calm by design', () => {
  test('plain outline icons, no emoji, on the app’s pages', async ({ page }) => {
    server.seed('habits', [{ id: 'h1', title: 'Take meds', notify_time: '08:00', timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: true, is_priority: true, current_streak: 3, best_streak: 5 }])
    const emoji = /\p{Extended_Pictographic}/u
    for (const path of ['/', '/habits', '/account', '/quests']) {
      await open(page, path)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForLoadState('networkidle')
      const text = await page.locator('body').innerText()
      expect(text.replace(/[✓✕]/g, ''), path).not.toMatch(emoji)
    }
    await open(page, '/account')
    await expect(page.locator('[data-icon="user"]').first()).toBeVisible()
  })

  test('the Dashboard shows key numbers and favorite buckets first; More stats starts closed and is remembered', async ({ page }) => {
    // Fresh storage for More stats on the first visit only (the fake server opens it for other tests).
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('fresh')) {
        localStorage.setItem('my-brain:dashboard-more', 'closed')
        sessionStorage.setItem('fresh', '1')
      }
    })
    server.seed('vault_buckets', [{ id: 'b1', name: 'Books', position: 0, checkable: false, starred: true }])
    await open(page, '/')
    await expect(page.getByTestId('dash-key')).toBeVisible()
    await expect(page.getByTestId('dash-favorites')).toBeVisible()
    await expect(page.getByTestId('dash-doing')).toBeHidden()
    await page.getByTestId('dash-more').locator('summary').click()
    await expect(page.getByTestId('dash-doing')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('dash-doing')).toBeVisible()
  })
})

test.describe('UI consistency (feedback, 2026-11-10)', () => {
  test('a chosen option is a soft tint with a check mark, not a solid fill (routine form)', async ({ page }) => {
    await open(page, '/routines')
    await page.getByRole('button', { name: /New routine/ }).click()
    const dialog = page.getByRole('dialog', { name: 'New routine' })
    await dialog.getByRole('checkbox', { name: /Run anytime/ }).uncheck()
    const mon = dialog.getByRole('group', { name: 'Repeats on' }).getByRole('button', { name: 'Mon' })
    await expect(mon).toHaveAttribute('aria-pressed', 'true')
    await expect(mon).toHaveClass(/choice-on/)
    const save = dialog.getByRole('button', { name: 'Save routine' })
    const [chipBg, saveBg] = await Promise.all([mon.evaluate((b) => getComputedStyle(b).backgroundColor), save.evaluate((b) => getComputedStyle(b).backgroundColor)])
    expect(chipBg).not.toBe(saveBg)
    await expect(dialog.getByTestId('routine-schedule').getByRole('radiogroup', { name: 'How often' })).toBeVisible()
    // Plenty of room between sections; the reminder time stands alone, with no Reminders box around it.
    await expect(dialog.getByTestId('routine-form')).toHaveCSS('row-gap', '24px')
    await expect(dialog.getByTestId('routine-schedule')).toHaveCSS('row-gap', '20px')
    await expect(dialog.getByLabel(/Reminder time/)).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Reminders' })).toHaveCount(0)
  })

  test('every task row has the same Edit button: today, Undated and Priority', async ({ page }) => {
    server.seed('tasks', [task('t1', 'pay rent'), task('t2', 'someday', { due_date: null })])
    server.seed('priority_tasks', [{ id: 'p1', title: 'Insulin', description: null, reminder_time: '20:00', due_date: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' }])
    await open(page, '/tasks')
    await page.getByRole('button', { name: 'Edit pay rent' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Undated' }).click()
    await expect(page.getByRole('button', { name: 'Edit someday' })).toBeVisible()
    await page.getByRole('tab', { name: 'Priority' }).click()
    await page.getByRole('button', { name: 'Edit Insulin' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit priority task' })).toBeVisible()
  })

  test('a new priority task with every default does not go off straight away', async ({ page }) => {
    await open(page, '/tasks')
    await page.getByRole('tab', { name: 'Priority' }).click()
    await page.getByRole('button', { name: '+ New priority task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New priority task' })
    await dialog.getByLabel('Title').fill('Check the oven')
    await dialog.getByRole('button', { name: 'Save priority task' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => server.written('priority_tasks').at(-1)).toMatchObject({ title: 'Check the oven', reminder_time: '10:00', start_date: DAY })
    await expect(page.getByRole('alertdialog', { name: 'Priority reminder' })).toHaveCount(0)
  })

  test('a one-off priority task in the past is refused', async ({ page }) => {
    await open(page, '/tasks')
    await page.getByRole('tab', { name: 'Priority' }).click()
    await page.getByRole('button', { name: '+ New priority task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New priority task' })
    await dialog.getByLabel('Title').fill('Too late')
    await dialog.getByLabel('Reminder time').fill('08:00')
    await dialog.getByRole('group', { name: 'When' }).getByRole('button', { name: 'One time' }).click()
    await dialog.getByLabel('Date').fill(DAY)
    await dialog.getByRole('button', { name: 'Save priority task' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Pick a time later than now.')
    expect(server.written('priority_tasks')).toHaveLength(0)
  })

  test('Vault item: notes under the title; rating, link and bucket in More details', async ({ page }) => {
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'bucket-1', title: 'Luigi’s', notes: null, created_at: '2026-11-09T12:00:00Z' }])
    await open(page, '/vault?bucket=bucket-1')
    await page.getByRole('button', { name: 'Open Luigi’s' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit item' })
    await expect(dialog.getByRole('textbox', { name: 'Notes (optional)' })).toBeVisible()
    await expect(dialog.getByLabel('Bucket')).toBeHidden()
    await dialog.getByTestId('vault-more').getByText('More details').click()
    await expect(dialog.getByLabel('Bucket')).toBeVisible()
  })

  test('Dashboard key row: days since worst day, longest current streak, best streak ever; nothing twice', async ({ page }) => {
    server.seed('tasks', [task('ty', 'yesterday task', { due_date: '2026-11-09', status: 'done', completed_at: '2026-11-09T15:00:00Z' })])
    await open(page, '/')
    const key = page.getByTestId('dash-key')
    await expect(key.locator('[data-testid^="dash-"]')).toHaveCount(4) // the three cards and the worst-day number
    await expect(key).toContainText('Days since your worst day')
    await expect(page.getByTestId('dash-worst-day')).toHaveCount(1)
    await expect(page.getByTestId('dash-journal')).not.toContainText('worst day')
    await expect(page.getByTestId('dash-yesterday')).toContainText('Routines')
  })
})
