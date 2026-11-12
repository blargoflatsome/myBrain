import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

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

test.describe('Spec §5 Tasks: the daily list', () => {
  test('today orders open tasks High, Medium, Low with colored markers', async ({ page }) => {
    server.seed('tasks', [
      task('a', 'water plants', '2026-11-10', { priority: 1 }),
      task('bb', 'pay rent', '2026-11-10', { priority: 3 }),
      task('ccc', 'email Sam', '2026-11-10', { priority: 2 }),
    ])
    await open(page)
    await expect(page.getByTestId('task-title')).toHaveText(['pay rent', 'email Sam', 'water plants'])
    await expect(page.getByTestId('task-priority')).toHaveText(['High', 'Medium', 'Low'])
  })

  test('completing a task crosses it off and moves it below open tasks', async ({ page }) => {
    server.seed('tasks', [task('a', 'first', '2026-11-10', { priority: 3 }), task('bb', 'second', '2026-11-10')])
    await open(page)
    await page.getByRole('button', { name: 'Cross off first' }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['second', 'first'])
    await expect(item(page, 'first').getByTestId('task-title')).toHaveClass(/line-through/)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 'a', status: 'done' })
  })
})

test.describe('Spec §5 Tasks: one line at a time and Pick 3', () => {
  test('only one line sits above the list: the past-you line today, the intro in Undated', async ({ page }) => {
    server.seed('tasks', [task('a', 'pay rent', '2026-11-10'), task('bb', 'someday', null)])
    await open(page)
    await expect(page.getByTestId('tasks-line')).toHaveText(msg.tasks.pastYouToday)
    await expect(page.getByTestId('tasks-intro')).toHaveCount(0)
    await page.getByRole('tab', { name: msg.tasks.undatedHeading }).click()
    await expect(page.getByTestId('tasks-line')).toHaveText(msg.tasks.intro)
  })

  test('Pick 3 shows the first 3 open tasks, folds the rest, and is remembered', async ({ page }) => {
    server.seed('tasks', [
      task('a', 'low one', '2026-11-10', { priority: 1 }),
      task('bb', 'high one', '2026-11-10', { priority: 3 }),
      task('ccc', 'medium one', '2026-11-10', { priority: 2 }),
      task('dddd', 'low two', '2026-11-10', { priority: 1 }),
    ])
    await open(page)
    await page.getByTestId('pick-three').click()
    await expect(page.getByTestId('task-title').filter({ visible: true })).toHaveText(['high one', 'medium one', 'low one'])
    await page.reload()
    await page.getByTestId('show-rest').click()
    await expect(page.getByTestId('task-title').filter({ visible: true })).toHaveText(['high one', 'medium one', 'low one', 'low two'])
  })
})

test.describe('Spec §5 Tasks: carry-over', () => {
  test('a task not done by midnight carries over to today in red text', async ({ page }) => {
    server.seed('tasks', [task('a', 'call bank', '2026-11-09'), task('bb', 'fresh', '2026-11-10')])
    await open(page)
    await expect(item(page, 'call bank').getByTestId('task-title')).toHaveClass(/text-carried/)
    await expect(item(page, 'fresh').getByTestId('task-title')).not.toHaveClass(/text-carried/)
    await expect(item(page, 'call bank')).toContainText(msg.tasks.carriedOnce)
    await expect(item(page, 'call bank').getByRole('button', { name: msg.tasks.cancel })).toHaveCount(0)
  })

  test('carried over a second time: Cancel task appears; Cancel removes it but keeps history', async ({ page }) => {
    server.seed('tasks', [task('a', 'clean garage', '2026-11-08')])
    await open(page)
    const row = item(page, 'clean garage')
    await expect(row).toContainText(msg.tasks.carriedMany(2))
    await row.getByRole('button', { name: msg.tasks.cancel }).click()
    await expect(row).toHaveCount(0)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 'a', status: 'cancelled', deleted_at: null })
  })

  for (const [button, dueDate] of [[msg.tasks.moveTomorrow, '2026-11-11'], [msg.tasks.moveUndated, null]] as const) {
    test(`carried over a second time: ${button} moves it in one tap, and Undo puts it back`, async ({ page }) => {
      server.seed('tasks', [task('a', 'clean garage', '2026-11-08')])
      await open(page)
      await item(page, 'clean garage').getByRole('button', { name: button, exact: true }).click()
      await expect(item(page, 'clean garage')).toHaveCount(0)
      await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 'a', due_date: dueDate, status: 'open' })
      await page.getByRole('button', { name: msg.undo.undo, exact: true }).click()
      await expect(item(page, 'clean garage')).toContainText(msg.tasks.carriedMany(2))
      await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 'a', due_date: '2026-11-08' })
    })
  }

  test('editing makes it easier: moving it to today clears the carry-over', async ({ page }) => {
    server.seed('tasks', [task('a', 'clean garage', '2026-11-08')])
    await open(page)
    await item(page, 'clean garage').getByTestId('task-title').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await dialog.getByLabel(msg.tasks.editor.title).fill('clean one shelf')
    await dialog.getByLabel(msg.capture.taskDateLabel).fill('2026-11-10')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(item(page, 'clean one shelf').getByTestId('task-title')).not.toHaveClass(/text-carried/)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'clean one shelf', due_date: '2026-11-10' })
  })

  test('the list rolls over at midnight while the app stays open', async ({ page }) => {
    server.seed('tasks', [task('a', 'finish essay', '2026-11-10')])
    await open(page, new Date('2026-11-11T04:59:00Z')) // 11:59 pm New York
    await expect(item(page, 'finish essay').getByTestId('task-title')).not.toHaveClass(/text-carried/)
    await page.clock.runFor(2 * 60_000) // past midnight
    await expect(item(page, 'finish essay').getByTestId('task-title')).toHaveClass(/text-carried/)
    await expect(item(page, 'finish essay')).toContainText(msg.tasks.carriedOnce)
  })

  test('the app was closed for days: carry-over is still counted from the dates', async ({ page }) => {
    server.seed('tasks', [task('a', 'renew license', '2026-11-03')])
    await open(page)
    await expect(item(page, 'renew license')).toContainText(msg.tasks.carriedMany(7))
  })
})

test.describe('Spec §5 Tasks: scheduling and the Undated list', () => {
  test('a task can be scheduled for a future day and shows only on that day', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: msg.tasks.day.next }).click()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(msg.tasks.day.tomorrow)
    await page.getByRole('textbox', { name: 'Add a task for tomorrow' }).fill('pick up dry cleaning')
    await page.getByRole('button', { name: msg.tasks.add }).click()
    await expect(item(page, 'pick up dry cleaning')).toBeVisible()
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({ due_date: '2026-11-11', source: 'manual', priority: 1 })

    await page.getByTestId('tasks-today').click()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(msg.tasks.todayHeading)
    await expect(item(page, 'pick up dry cleaning')).toHaveCount(0)
  })

  test('undated tasks live in Undated, never carry over, and default to Low', async ({ page }) => {
    server.seed('tasks', [task('a', 'someday: learn piano', null)])
    await open(page)
    await expect(item(page, 'someday: learn piano')).toHaveCount(0)
    await page.getByRole('tab', { name: msg.tasks.undatedHeading }).click()
    await expect(item(page, 'someday: learn piano').getByTestId('task-title')).not.toHaveClass(/text-carried/)
    await page.getByRole('textbox', { name: msg.tasks.addPlaceholderUndated }).fill('fix bike')
    await page.getByRole('button', { name: msg.tasks.add }).click()
    await expect(item(page, 'fix bike').getByTestId('task-priority')).toHaveText(msg.tasks.priority.low)
    await expect.poll(() => server.written('tasks')[0]).toMatchObject({ title: 'fix bike', due_date: null })
  })

  test('priority can be changed in Edit and changes the order', async ({ page }) => {
    server.seed('tasks', [task('a', 'first', '2026-11-10', { priority: 2 }), task('bb', 'second', '2026-11-10')])
    await open(page)
    await page.getByRole('button', { name: /^second/ }).click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    await dialog.getByText(msg.tasks.priority.high).click()
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByTestId('task-title')).toHaveText(['second', 'first'])
  })
})
