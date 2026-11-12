import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// SPEC §2 Rows look alike, Adding looks alike; §5 Tasks moving between days. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York' })
const NOW = new Date('2026-11-10T14:00:00Z')
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const bar = (page: Page) => page.getByTestId('undo-bar')

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('SPEC §2 Rows look alike: the title edits, the trash can deletes', () => {
  test('a task row: the title opens its editor, and the trash can deletes it straight away with Undo', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', due_date: '2026-11-10', status: 'open', source: 'manual', priority: 1 }])
    await open(page, '/tasks')
    await page.getByTestId('task-title').click()
    await expect(page.getByRole('dialog', { name: msg.tasks.editor.heading })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: msg.tasks.deleteLabel('pay rent') }).click()
    await expect(page.getByTestId('task-title')).toHaveCount(0)
    await bar(page).getByRole('button', { name: msg.undo.undo }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['pay rent'])
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', deleted_at: null })
  })

  // These go with their history (or reminders), so the trash can asks first (SPEC §2 Confirm before impact).
  const askFirst = [
    {
      what: 'a habit',
      path: '/habits',
      table: 'habits',
      seed: { id: 'h1', title: 'Stretch', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-10', is_private: false },
      label: msg.habits.deleteLabel('Stretch'),
      heading: msg.habits.confirmDelete.heading,
    },
    {
      what: 'a routine',
      path: '/routines',
      table: 'routines',
      seed: { id: 'r1', title: 'Morning', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-10' },
      label: msg.routines.deleteLabel('Morning'),
      heading: msg.routines.confirmDelete.heading,
    },
    {
      what: 'a priority task',
      path: '/tasks',
      table: 'priority_tasks',
      seed: { id: 'p1', title: 'Take meds', reminder_time: '20:00', due_date: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-10' },
      label: msg.priority.deleteLabel('Take meds'),
      heading: msg.priority.confirmDelete.heading,
    },
  ]
  for (const c of askFirst) {
    test(`${c.what} row: the trash can asks first, then deletes it`, async ({ page }) => {
      server.seed(c.table, [c.seed])
      await open(page, c.path)
      if (c.table === 'priority_tasks') await page.getByRole('tab', { name: msg.priority.tabHeading }).click()
      await page.getByRole('button', { name: c.label }).click()
      const confirm = page.getByRole('alertdialog', { name: c.heading })
      await confirm.getByRole('button', { name: msg.habits.confirmDelete.keep }).click()
      expect(server.written(c.table).filter((r) => r.deleted_at)).toHaveLength(0)

      await page.getByRole('button', { name: c.label }).click()
      await confirm.getByRole('button', { name: msg.habits.confirmDelete.confirm, exact: true }).click()
      await expect(confirm).toBeHidden()
      await expect.poll(() => server.written(c.table).filter((r) => r.id === c.seed.id).at(-1)?.deleted_at).toBeTruthy()
    })
  }
})

test.describe('SPEC §2 Adding looks alike: + New … on every list page', () => {
  test('+ New task on another day opens the editor and saves the task for that day', async ({ page }) => {
    await open(page, '/tasks')
    await page.getByRole('button', { name: msg.tasks.day.next }).click()
    await page.getByRole('button', { name: msg.tasks.newTask }).click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.newHeading })
    await expect(dialog.getByRole('button', { name: msg.tasks.editor.delete })).toHaveCount(0)
    await dialog.getByLabel(msg.tasks.editor.title).fill('buy stamps')
    await dialog.getByRole('button', { name: msg.tasks.editor.save }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['buy stamps'])
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'buy stamps', due_date: '2026-11-11', status: 'open', priority: 1 })
  })

  test('+ New quest saves a quest on the Quests page, starting as Ugh and 30 min', async ({ page }) => {
    await open(page, '/quests')
    await page.getByRole('button', { name: msg.quests.newQuest }).click()
    const dialog = page.getByRole('dialog', { name: msg.quests.editor.newHeading })
    await dialog.getByLabel(msg.quests.editor.title).fill('Build a birdhouse')
    await dialog.getByRole('button', { name: msg.quests.editor.save }).click()
    await expect(page.getByTestId('quest-title')).toHaveText(['Build a birdhouse'])
    await expect.poll(() => server.written('quests').at(-1)).toMatchObject({ title: 'Build a birdhouse', energy_level: 'ugh', time_bucket: '30m', status: 'open' })
  })
})

test.describe('SPEC §5 Tasks: moving between days', () => {
  test('a Today button shows on another day and brings me back to today', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', due_date: '2026-11-10', status: 'open', source: 'manual', priority: 1 }])
    await open(page, '/tasks')
    await expect(page.getByTestId('tasks-today')).toHaveCount(0)
    await page.getByRole('button', { name: msg.tasks.day.previous }).click()
    await page.getByRole('button', { name: msg.tasks.day.previous }).click()
    await expect(page.getByTestId('task-title')).toHaveCount(0)
    await page.getByTestId('tasks-today').click()
    await expect(page.getByTestId('task-title')).toHaveText(['pay rent'])
    await expect(page.getByTestId('tasks-today')).toHaveCount(0)
  })
})
