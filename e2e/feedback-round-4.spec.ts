import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { isPhone } from './support/devices'

// Feedback round 4 (SPEC §2 Windows, §5 Forms, Date fields, Habits, Journal, Random Quest, Calendar, Dashboard,
// §8 Delete my data). New York, Tue Nov 10 2026, 9:20 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:20:00Z')
const DAY = '2026-11-10'
let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.
const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'
const LONG_WORD = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query&and=more'

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const lastWrite = (table: string) => server.written(table).at(-1)
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

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
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    const x = dialog.getByRole('button', { name: 'Close' }).and(dialog.getByTestId('close-x'))
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
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    await dialog.getByRole('heading', { name: 'Edit task' }).click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(4, 4)
    await expect(dialog).toBeHidden()
  })
})

test.describe('Spec §5 Forms: optional details in More details, formatted notes', () => {
  test('a task editor keeps notes, priority and tags folded away until opened', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    await expect(dialog.getByRole('textbox', { name: 'Notes' })).toBeHidden()
    await dialog.getByText('More details').click()
    const notes = dialog.getByRole('textbox', { name: 'Notes' })
    await notes.click()
    await page.keyboard.type('Bring the ')
    await dialog.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('checkbook')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('tasks')?.notes).toBe('<p>Bring the <strong>checkbook</strong></p>')
  })

  test('More details opens by itself when something in it is set, and old plain notes still show', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: `${LONG_LINE}\n${LONG_WORD}`, due_date: DAY, priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const notes = page.getByRole('dialog', { name: 'Edit task' }).getByRole('textbox', { name: 'Notes' })
    await expect(notes).toBeVisible()
    await expect(notes).toContainText(LONG_LINE)
    await page.setViewportSize({ width: 320, height: 700 })
    expect(await noSidewaysScroll(page)).toBe(true)
  })

  test('Capture: a task is just a title and a date until More details is opened', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('button', { name: 'Task', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Priority' })).toBeHidden()
    await page.getByLabel('Title', { exact: true }).fill('Buy stamps')
    await page.getByTestId('capture-more').getByText('More details').click()
    await page.getByRole('group', { name: 'Priority' }).getByRole('button', { name: 'High' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('tasks')).toMatchObject({ title: 'Buy stamps', priority: 3 })
  })
})

test.describe('Spec §5 Habits: form layout', () => {
  test('repeats on sits with how often; reminders are grouped in their own box; private is in More details', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    const howOften = dialog.getByTestId('habit-how-often')
    await expect(howOften.getByRole('radiogroup', { name: 'How often' })).toBeVisible()
    await expect(howOften.getByRole('group', { name: 'Repeats on' })).toBeVisible()
    const reminders = dialog.getByRole('group', { name: 'Reminders' })
    await expect(reminders.getByLabel('Reminder time (optional)')).toBeVisible()
    await expect(reminders.getByLabel('Timer')).toBeVisible()
    await expect(reminders.getByLabel(/^Priority/)).toBeVisible()
    await expect(reminders).toHaveCSS('border-top-style', 'solid')
    await expect(dialog.getByLabel(/^Private/)).toBeHidden()
    await dialog.getByTestId('habit-more').getByText('More details').click()
    await expect(dialog.getByLabel(/^Private/)).toBeVisible()
  })
})

test.describe('Spec §5 Date fields: type or pick (on a computer)', () => {
  test.beforeEach(({}, info) => test.skip(isPhone(info), 'phones use their own date picker'))

  test('typing "tomorrow" sets the day, and it shows the app’s way', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    const date = dialog.getByRole('combobox', { name: 'Date' })
    await expect(date).toHaveValue('Tue, Nov 10')
    await date.fill('tomorrow')
    await date.blur()
    await expect(date).toHaveValue('Wed, Nov 11')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => lastWrite('tasks')?.due_date).toBe('2026-11-11')
  })

  test('the month grid works with the keyboard: arrows, Page Down, Enter; Escape closes just the grid', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    const start = dialog.getByRole('combobox', { name: 'Starts on' })
    await start.focus()
    await page.keyboard.press('ArrowDown')
    await expect(dialog.getByTestId('date-grid')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog.getByTestId('date-grid')).toBeHidden()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('Enter')
    await expect(start).toHaveValue('Fri, Dec 11')
  })

  test('a day before the habit may start can’t be typed in', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: '+ New habit' }).click()
    const start = page.getByRole('dialog', { name: 'New habit' }).getByRole('combobox', { name: 'Starts on' })
    await start.fill('2026-11-09')
    await start.blur()
    await expect(start).toHaveValue('Tue, Nov 10')
  })
})

test.describe('Spec §5 Journal: the tomorrow box is the same size as the writing', () => {
  test('both boxes are the same height', async ({ page }) => {
    await open(page, '/journal')
    const write = page.getByRole('textbox', { name: 'How the day went' })
    const tomorrow = page.getByRole('textbox', { name: 'How to make tomorrow better?' })
    await expect(tomorrow).toBeVisible()
    const [a, b] = [(await write.boundingBox())!, (await tomorrow.boundingBox())!]
    expect(Math.abs(a.height - b.height)).toBeLessThan(2)
  })
})

test.describe('Spec §5 Random Quest: done quests stay; Pick and delete in the list', () => {
  test.beforeEach(() => {
    server.seed('quests', [
      { id: 'q1', title: 'Paint the fence', details: '<p>Use the <strong>blue</strong> paint</p>', energy_level: 'ugh', time_bucket: '30m', status: 'open', times_picked: 0 },
      { id: 'q2', title: LONG_LINE, details: null, energy_level: 'fun', time_bucket: '2h', status: 'open', times_picked: 0 },
    ])
  })

  test('Pick shows that quest, with its formatted details; Mark done keeps it in the list', async ({ page }) => {
    await open(page, '/quests')
    await page.getByRole('button', { name: 'Pick Paint the fence' }).click()
    const result = page.getByTestId('quest-result')
    await expect(result.getByRole('heading', { name: 'Paint the fence' })).toBeVisible()
    await expect(result.locator('strong')).toHaveText('blue')
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', times_picked: 1 })
    await result.getByRole('button', { name: 'Mark done' }).click()
    await expect.poll(() => lastWrite('quest_logs')).toMatchObject({ quest_id: 'q1', date: DAY })
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', status: 'open' })
    const row = page.getByTestId('quest-row').filter({ hasText: 'Paint the fence' })
    await expect(row.getByTestId('quest-done-count')).toHaveText('Done once')
  })

  test('the trash can removes the quest straight away, with Undo (SPEC §2)', async ({ page }) => {
    await open(page, '/quests')
    await page.getByRole('button', { name: 'Delete Paint the fence' }).click()
    await expect(page.getByTestId('quest-row').filter({ hasText: 'Paint the fence' })).toHaveCount(0)
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', deleted_at: expect.any(String) })
  })

  test('a long quest title still fits a 320 px screen with its buttons', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page, '/quests')
    await expect(page.getByRole('button', { name: `Pick ${LONG_LINE}` })).toBeVisible()
    expect(await noSidewaysScroll(page)).toBe(true)
  })
})

test.describe('Spec §5 Dashboard: quests done yesterday', () => {
  test('"How past you did yesterday" counts and names them', async ({ page }) => {
    server.seed('quests', [{ id: 'q1', title: 'Paint the fence', status: 'open', times_picked: 1 }])
    server.seed('quest_logs', [{ id: 'l1', quest_id: 'q1', date: '2026-11-09', completed_at: '2026-11-09T20:00:00Z' }])
    await open(page, '/')
    const yesterday = page.getByTestId('dash-yesterday')
    await expect(yesterday.getByTestId('dash-yesterday-quests')).toHaveText('1')
    await expect(yesterday.getByTestId('dash-yesterday-quest')).toHaveText('✓ Paint the fence')
  })
})

test.describe('Spec §5 Calendar: month first, read-only window with Edit', { tag: '@phone' }, () => {
  test.beforeEach(() => {
    server.seed('tasks', [{ id: 't1', title: LONG_LINE, notes: `<p>${LONG_WORD}</p>`, due_date: '2026-11-12', priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    server.seed('events', [{ id: 'e1', title: 'Dinner', notes: '<p>Bring <em>wine</em></p>', start_date: '2026-11-13', start_time: '19:00', end_date: '2026-11-13', end_time: '21:00', repeat: 'never', reminder_minutes: 60 }])
  })

  test('it opens on the month, on every screen size', async ({ page }) => {
    await open(page, '/calendar')
    await expect(page.getByTestId('calendar-title')).toHaveText('November 2026')
    await expect(page.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('tapping a task opens it read-only over the calendar; Edit opens its editor there', async ({ page }) => {
    await open(page, '/calendar')
    await page.locator('.cal-task').first().click()
    const view = page.getByTestId('calendar-item')
    await expect(view).toBeVisible()
    await expect(view.getByText('Task', { exact: true })).toBeVisible()
    await expect(view.getByTestId('calendar-item-when')).toHaveText('Thu, Nov 12')
    await expect(view.getByText('High')).toBeVisible()
    await expect(page).toHaveURL(/\/calendar/)
    expect(await view.evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true)
    await view.getByRole('button', { name: 'Edit' }).click()
    const editor = page.getByRole('dialog', { name: 'Edit task' })
    await expect(editor).toBeVisible()
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toBeHidden()
    await expect(page).toHaveURL(/\/calendar/)
  })

  test('an event shows when, its reminder and formatted notes; Edit opens the event editor', async ({ page }) => {
    await open(page, '/calendar')
    await page.locator('.cal-event').filter({ hasText: 'Dinner' }).first().click()
    const view = page.getByTestId('calendar-item')
    await expect(view.getByTestId('calendar-item-when')).toHaveText('Fri, Nov 13 · 7:00 pm – 9:00 pm')
    await expect(view.getByText('1 hour before')).toBeVisible()
    await expect(view.getByTestId('calendar-item-notes').locator('em')).toHaveText('wine')
    await view.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit event' })).toBeVisible()
  })
})

test.describe('Spec §8 Delete my data: an orange warning, not red', () => {
  test('its button uses the warning colour; Delete My Account stays red', async ({ page }) => {
    await open(page, '/account')
    const wipe = page.getByTestId('delete-data').getByRole('button')
    const account = page.getByTestId('delete-account').getByRole('button')
    await expect(wipe).toBeVisible()
    const [wipeColor, accountColor] = await Promise.all([wipe.evaluate((b) => getComputedStyle(b).color), account.evaluate((b) => getComputedStyle(b).color)])
    expect(wipeColor).not.toBe(accountColor)
    const [r, g, b] = wipeColor.match(/\d+/g)!.map(Number)
    expect(r).toBeGreaterThan(g!) // orange: lots of red, some green, little blue
    expect(g).toBeGreaterThan(b!)
  })
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
    await expect(page.getByTestId('undo-bar')).toContainText('Cleared 2 crossed-off tasks')
    await expect(page.getByText('Everything past you asked for today is done!.')).toBeVisible()
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
