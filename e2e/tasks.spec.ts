import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour is tested with a controlled clock. Here: New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York' })
const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

function task(id: string, title: string, due_date: string | null, extra: Record<string, unknown> = {}) {
  return { id, title, due_date, status: 'open', source: 'manual', priority: 1, created_at: `2026-11-01T00:00:0${id.length}Z`, ...extra }
}

async function open(page: Page, time = NOW) {
  await page.clock.install({ time })
  await page.goto('/tasks')
}

const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Tasks: daily list in the "past you" voice', () => {
  test('today shows past-you wording and orders open tasks High, Medium, Low with colored markers', async ({ page }) => {
    server.seed('tasks', [
      task('a', 'water plants', '2026-11-10', { priority: 1 }),
      task('bb', 'pay rent', '2026-11-10', { priority: 3 }),
      task('ccc', 'email Sam', '2026-11-10', { priority: 2 }),
    ])
    await open(page)
    await expect(page.getByText('Past you left you these for today.')).toBeVisible()
    await expect(page.getByTestId('task-title')).toHaveText(['pay rent', 'email Sam', 'water plants'])
    await expect(page.getByTestId('task-priority')).toHaveText(['High', 'Medium', 'Low'])
  })

  test('an empty day invites me to enjoy it or add something', async ({ page }) => {
    await open(page)
    await expect(page.getByText('Past you left nothing for today. Enjoy it, or add something.')).toBeVisible()
  })

  test('completing a task crosses it off and moves it below open tasks', async ({ page }) => {
    server.seed('tasks', [task('a', 'first', '2026-11-10', { priority: 3 }), task('bb', 'second', '2026-11-10')])
    await open(page)
    await page.getByRole('button', { name: 'Cross off first' }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['second', 'first'])
    await expect(item(page, 'first').getByTestId('task-title')).toHaveClass(/line-through/)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 'a', status: 'done' })
  })

  test('when every task is done, past you would be proud', async ({ page }) => {
    server.seed('tasks', [task('a', 'only one', '2026-11-10')])
    await open(page)
    await page.getByRole('button', { name: 'Cross off only one' }).click()
    await expect(page.getByText('Everything past you asked for today is done. Past you would be proud.')).toBeVisible()
  })
})

test.describe('Spec §5 Tasks: carry-over', () => {
  test('a task not done by midnight carries over to today in red text', async ({ page }) => {
    server.seed('tasks', [task('a', 'call bank', '2026-11-09'), task('bb', 'fresh', '2026-11-10')])
    await open(page)
    await expect(item(page, 'call bank').getByTestId('task-title')).toHaveClass(/text-danger/)
    await expect(item(page, 'fresh').getByTestId('task-title')).not.toHaveClass(/text-danger/)
    await expect(item(page, 'call bank')).toContainText('Past you hoped this would happen yesterday.')
    await expect(item(page, 'call bank').getByRole('button', { name: 'Cancel task' })).toHaveCount(0)
  })

  test('carried over a second time: Cancel and Edit appear; Cancel removes it but keeps history', async ({ page }) => {
    server.seed('tasks', [task('a', 'clean garage', '2026-11-08')])
    await open(page)
    const row = item(page, 'clean garage')
    await expect(row).toContainText('Past you has carried this for 2 days. Make it easier, or let it go?')
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible()
    await row.getByRole('button', { name: 'Cancel task' }).click()
    await expect(row).toHaveCount(0)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 'a', status: 'cancelled', deleted_at: null })
  })

  test('Edit makes it easier: moving it to today clears the carry-over', async ({ page }) => {
    server.seed('tasks', [task('a', 'clean garage', '2026-11-08')])
    await open(page)
    await item(page, 'clean garage').getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    await dialog.getByLabel('Title').fill('clean one shelf')
    await dialog.getByLabel('Date').fill('2026-11-10')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(item(page, 'clean one shelf').getByTestId('task-title')).not.toHaveClass(/text-danger/)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'clean one shelf', due_date: '2026-11-10' })
  })

  test('the list rolls over at midnight while the app stays open', async ({ page }) => {
    server.seed('tasks', [task('a', 'finish essay', '2026-11-10')])
    await open(page, new Date('2026-11-11T04:59:00Z')) // 11:59 pm New York
    await expect(item(page, 'finish essay').getByTestId('task-title')).not.toHaveClass(/text-danger/)
    await page.clock.runFor(2 * 60_000) // past midnight
    await expect(item(page, 'finish essay').getByTestId('task-title')).toHaveClass(/text-danger/)
    await expect(item(page, 'finish essay')).toContainText('Past you hoped this would happen yesterday.')
  })

  test('the app was closed for days: carry-over is still counted from the dates', async ({ page }) => {
    server.seed('tasks', [task('a', 'renew license', '2026-11-03')])
    await open(page)
    await expect(item(page, 'renew license')).toContainText('Past you has carried this for 7 days.')
  })
})

test.describe('Spec §5 Tasks: scheduling and the Undated list', () => {
  test('a task can be scheduled for a future day and shows only on that day', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Tomorrow')
    await page.getByRole('textbox', { name: 'Add a task for tomorrow' }).fill('pick up dry cleaning')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(item(page, 'pick up dry cleaning')).toBeVisible()
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({ due_date: '2026-11-11', source: 'manual', priority: 1 })

    await page.getByRole('heading', { level: 2 }).click() // back to today
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Today')
    await expect(item(page, 'pick up dry cleaning')).toHaveCount(0)
  })

  test('undated tasks live in Undated, never carry over, and default to Low', async ({ page }) => {
    server.seed('tasks', [task('a', 'someday: learn piano', null)])
    await open(page)
    await expect(item(page, 'someday: learn piano')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Undated' }).click()
    await expect(item(page, 'someday: learn piano').getByTestId('task-title')).not.toHaveClass(/text-danger/)
    await page.getByRole('textbox', { name: 'Add an undated task' }).fill('fix bike')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(item(page, 'fix bike').getByTestId('task-priority')).toHaveText('Low')
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({ title: 'fix bike', due_date: null })
  })

  test('priority can be changed in Edit and changes the order', async ({ page }) => {
    server.seed('tasks', [task('a', 'first', '2026-11-10', { priority: 2 }), task('bb', 'second', '2026-11-10')])
    await open(page)
    await page.getByRole('button', { name: /^second/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    await dialog.getByText('High').click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['second', 'first'])
  })
})

test.describe('Spec §2: confirm before removing data', () => {
  test('Delete explains what will happen and only deletes after confirming', async ({ page }) => {
    server.seed('tasks', [task('a', 'old idea', '2026-11-10')])
    await open(page)
    await page.getByRole('button', { name: /^old idea/ }).click()
    await page.getByRole('button', { name: 'Delete task' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this task?' })
    await expect(confirm).toContainText('"old idea" will be removed from all your devices.')

    await confirm.getByRole('button', { name: 'Keep it' }).click()
    expect(server.written('tasks')).toHaveLength(0)

    await page.getByRole('button', { name: 'Delete task' }).click()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(item(page, 'old idea')).toHaveCount(0)
    await expect.poll(() => server.written('tasks').at(-1)?.deleted_at).toBeTruthy()
  })
})
