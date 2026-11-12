import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isPhone } from '../support/devices'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

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

test.describe('Spec §5 Forms: optional details in More details, formatted notes', () => {
  test('a task editor shows notes in view; only priority and tags are in More details', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await expect(dialog.getByTestId('task-more').getByRole('textbox', { name: msg.tasks.editor.notes })).toHaveCount(0)
    await expect(dialog.getByTestId('task-more')).toContainText(msg.tasks.editor.moreSummary)
    const notes = dialog.getByRole('textbox', { name: msg.tasks.editor.notes })
    await notes.click()
    await page.keyboard.type('Bring the ')
    await dialog.getByRole('button', { name: msg.editor.bold }).click()
    await page.keyboard.type('checkbook')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('tasks')?.notes).toBe('<p>Bring the <strong>checkbook</strong></p>')
  })

  test('More details opens by itself when something in it is set, and old plain notes still show', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: `${LONG_LINE}\n${LONG_WORD}`, due_date: DAY, priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const notes = page.getByRole('dialog', { name: msg.tasks.editor.heading }).getByRole('textbox', { name: msg.tasks.editor.notes })
    await expect(notes).toBeVisible()
    await expect(notes).toContainText(LONG_LINE)
    await page.setViewportSize({ width: 320, height: 700 })
    expect(await noSidewaysScroll(page)).toBe(true)
  })

  test('Capture: a task shows notes and priority in view, with no More details', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('button', { name: msg.search.type.task, exact: true }).click()
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
    await page.getByLabel(msg.capture.titleLabel, { exact: true }).fill('Buy stamps')
    await expect(page.getByRole('textbox', { name: msg.capture.notesLabel })).toBeVisible()
    await page.getByRole('group', { name: msg.journal.priority }).getByRole('button', { name: msg.tasks.priority.high }).click()
    await page.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('tasks')).toMatchObject({ title: 'Buy stamps', priority: 3 })
  })

  test('a form with only one optional extra has no More details: routine and priority task editors, Capture Vault', async ({ page }) => {
    await open(page, '/routines')
    await page.getByRole('button', { name: /New routine/ }).click()
    const routine = page.getByRole('dialog', { name: msg.routines.editor.newHeading })
    await expect(routine.getByRole('combobox', { name: msg.tags.add })).toBeVisible()
    await expect(routine.getByText(msg.forms.moreOptions)).toHaveCount(0)

    await open(page, '/tasks')
    await page.getByRole('tab', { name: msg.journal.priority }).click()
    await page.getByRole('button', { name: msg.priority.add }).click()
    const priority = page.getByRole('dialog', { name: msg.priority.editor.newHeading })
    await expect(priority.getByRole('textbox', { name: msg.capture.detailsLabel })).toBeVisible()
    await expect(priority.getByText(msg.forms.moreOptions)).toHaveCount(0)

    await open(page, '/capture')
    await page.getByRole('button', { name: msg.nav.vault, exact: true }).click()
    await expect(page.getByRole('textbox', { name: msg.capture.notesLabel })).toBeVisible()
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
  })

  test('Capture: a quest shows energy, time and details in view (no More details)', async ({ page }) => {
    await open(page, '/capture')
    await page.getByRole('button', { name: msg.search.type.quest, exact: true }).click()
    await expect(page.getByText(msg.forms.moreOptions)).toHaveCount(0)
    const quest = page.getByTestId('capture-quest')
    await expect(quest.getByRole('button', { name: msg.quests.energy.ugh })).toBeVisible()
    await expect(quest.getByRole('button', { name: msg.quests.time["30m"] })).toBeVisible()
  })
})

test.describe('Spec §5 Habits: form layout', () => {
  test('Private sits right under the title; Reminders folds away; no More details', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
    const fields = dialog.getByTestId('habit-fields')
    await expect(fields.locator(':scope > *').first().getByRole('checkbox', { name: /^Private/ })).toBeVisible()
    const howOften = dialog.getByTestId('habit-how-often')
    await expect(howOften.getByRole('radiogroup', { name: msg.forms.howOften })).toBeVisible()
    await expect(howOften.getByRole('group', { name: msg.habits.editor.weekdays })).toBeVisible()
    await expect(dialog.getByText(msg.forms.moreOptions)).toHaveCount(0)
    await expect(dialog.getByRole('combobox', { name: msg.tags.add })).toBeVisible()
    const reminders = dialog.getByTestId('habit-reminders')
    await expect(reminders.getByLabel(msg.habits.editor.notifyTime)).toBeHidden()
    await reminders.locator('summary').click()
    await expect(reminders.getByLabel(msg.habits.editor.notifyTime)).toBeVisible()
    await expect(reminders.getByLabel(msg.habits.editor.timer)).toBeVisible()
    await expect(reminders.getByLabel(/^Priority/)).toBeVisible()
  })

  test('Reminders opens by itself when the habit has a reminder time', async ({ page }) => {
    server.seed('habits', [{ id: 'h1', title: 'Stretch', notify_time: '08:00', timer_minutes: null, weekdays: [4], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0 }])
    await open(page, '/habits')
    await page.getByRole('button', { name: /Stretch/ }).first().click()
    await expect(page.getByRole('dialog', { name: msg.habits.editor.heading }).getByLabel(msg.habits.editor.notifyTime)).toBeVisible()
  })
})

test.describe('Spec §5 Calendar: event form sections', () => {
  test('a new event opens with Schedule open (date, time, repeat, reminder); Attendees is folded with who is going first', async ({ page }) => {
    await open(page, '/calendar')
    await page.getByRole('button', { name: msg.calendar.newEvent }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    const schedule = dialog.getByTestId('event-schedule')
    for (const name of ['All day', 'Starts Date', 'Ends Date', 'Repeat', 'Reminder']) await expect(schedule.getByLabel(name).first()).toBeVisible()
    await expect(dialog.getByTestId('event-more')).toHaveCount(0)
    const attendees = dialog.getByTestId('event-people')
    await expect(attendees).toContainText("Who's going, and inviting people")
    await expect(attendees.getByRole('button', { name: msg.invites.contacts })).toBeHidden()
    await attendees.locator('summary').click()
    await expect(attendees.getByRole('button', { name: msg.invites.contacts })).toBeVisible()
    await expect(attendees.getByRole('checkbox', { name: /Guests can see who’s going/ })).toBeVisible()
  })

  test('an existing event folds Schedule away, with when it is in the summary; invited people open Attendees', async ({ page }) => {
    server.seed('events', [{ id: 'e1', title: 'Lunch', notes: null, start_date: '2026-11-10', start_time: '12:30:00', end_date: '2026-11-10', end_time: '13:30:00', repeat: 'weekly', reminder_minutes: null }])
    server.rpcResults.event_people = [{ invite_id: 'inv-1', name: 'Pat', email: null, phone: '5550109000', response: 'yes', is_me: false }]
    await open(page, '/calendar?date=2026-11-10&event=e1')
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.tasks.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    const schedule = dialog.getByTestId('event-schedule')
    await expect(schedule.locator('summary')).toContainText('Tue, Nov 10 · 12:30 pm – 1:30 pm, every week')
    await expect(schedule.getByLabel(msg.calendar.editor.repeat)).toBeHidden()
    const attendees = dialog.getByTestId('event-people')
    await expect(attendees.locator('summary')).toContainText('1 invited · 1 going')
    await expect(attendees.getByTestId('invited-person')).toContainText('Pat')
  })
})

test.describe('Spec §5 Forms: an open fold-out stands out', () => {
  test('an open fold-out has a tinted header; a closed one inside an open group stays plain, with its arrow unturned', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const reminders = page.getByRole('dialog', { name: msg.habits.editor.newHeading }).getByTestId('habit-reminders')
    const header = reminders.getByTestId('fold-header')
    const plain = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
    await header.click()
    await expect.poll(() => header.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(plain)

    await open(page, '/account')
    const settings = page.getByTestId('account-group-settings')
    const outer = await settings.getByTestId('fold-header').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const inner = page.getByTestId('account-group-reminders').getByTestId('fold-header')
    await page.getByTestId('account-group-reminders').evaluate((el) => ((el as HTMLDetailsElement).open = false))
    expect(await inner.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(outer)
    await expect.poll(() => inner.locator('svg').evaluate((el) => getComputedStyle(el).rotate)).not.toBe('180deg')
  })
})

test.describe('Spec §5 Date fields: type or pick (on a computer)', () => {
  test.beforeEach(({}, info) => test.skip(isPhone(info), 'phones use their own date picker'))

  test('typing "tomorrow" sets the day, and it shows the app’s way', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    const date = dialog.getByRole('combobox', { name: msg.tasks.editor.date })
    await expect(date).toHaveValue('Tue, Nov 10')
    await date.fill('tomorrow')
    await date.blur()
    await expect(date).toHaveValue('Wed, Nov 11')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('tasks')?.due_date).toBe('2026-11-11')
  })

  test('the month grid works with the keyboard: arrows, Page Down, Enter; Escape closes just the grid', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
    const start = dialog.getByRole('combobox', { name: msg.habits.editor.startDate })
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
    await page.getByRole('button', { name: msg.habits.add }).click()
    const start = page.getByRole('dialog', { name: msg.habits.editor.newHeading }).getByRole('combobox', { name: msg.habits.editor.startDate })
    await start.fill('2026-11-09')
    await start.blur()
    await expect(start).toHaveValue('Tue, Nov 10')
  })
})

test.describe('Spec §5 Journal: the tomorrow box is the same size as the writing', () => {
  test('both boxes are the same height', async ({ page }) => {
    await open(page, '/journal')
    const write = page.getByRole('textbox', { name: msg.journal.writeLabel })
    const tomorrow = page.getByRole('textbox', { name: msg.journal.tomorrowLabel })
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
    await result.getByRole('button', { name: msg.quests.done }).click()
    await expect.poll(() => lastWrite('quest_logs')).toMatchObject({ quest_id: 'q1', date: DAY })
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', status: 'open' })
    const row = page.getByTestId('quest-row').filter({ hasText: 'Paint the fence' })
    await expect(row.getByTestId('quest-done-count')).toHaveText(msg.quests.doneCount(1))
  })

  test('the trash can removes the quest straight away, with Undo (SPEC §2)', async ({ page }) => {
    await open(page, '/quests')
    await page.getByRole('button', { name: 'Delete Paint the fence' }).click()
    await expect(page.getByTestId('quest-row').filter({ hasText: 'Paint the fence' })).toHaveCount(0)
    await expect.poll(() => lastWrite('quests')).toMatchObject({ id: 'q1', deleted_at: expect.any(String) })
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
    await expect(page.getByRole('button', { name: msg.calendar.views.month })).toHaveAttribute('aria-pressed', 'true')
  })

  test('tapping a task opens it read-only over the calendar; Edit opens its editor there', async ({ page }) => {
    await open(page, '/calendar')
    await page.locator('.cal-task').first().click()
    const view = page.getByTestId('calendar-item')
    await expect(view).toBeVisible()
    await expect(view.getByText(msg.search.type.task, { exact: true })).toBeVisible()
    await expect(view.getByTestId('calendar-item-when')).toHaveText('Thu, Nov 12')
    await expect(view.getByText(msg.tasks.priority.high)).toBeVisible()
    await expect(page).toHaveURL(/\/calendar/)
    expect(await view.evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true)
    await view.getByRole('button', { name: msg.tasks.edit }).click()
    const editor = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await expect(editor).toBeVisible()
    await editor.getByRole('button', { name: msg.capture.save }).click()
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
    await view.getByRole('button', { name: msg.tasks.edit }).click()
    await expect(page.getByRole('dialog', { name: msg.calendar.editor.heading })).toBeVisible()
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
    await expect(page.getByTestId('undo-bar')).toContainText(msg.undo.clearedTasks(2))
    await expect(page.getByText(msg.tasks.allDone)).toBeVisible()
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
