import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isSafari } from '../support/devices'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const MEDS = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
let server: FakeSupabase

function seedMeds(extra: Record<string, unknown> = {}) {
  server.seed('habits', [
    {
      id: MEDS,
      title: 'Take medications',
      notify_time: '08:00',
      timer_minutes: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      start_date: '2026-11-01',
      is_priority: true,
      ...extra,
    },
  ])
}
async function open(page: Page, path: string, iso: string) {
  await page.clock.install({ time: new Date(iso) })
  await page.goto(path)
}
const overlay = (page: Page) => page.getByRole('alertdialog', { name: msg.priority.overlayLabel })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5: full-screen reminder for priority habits', { tag: '@phone' }, () => {
  test('appears at the reminder time on any screen, with the reliability notice', async ({ page }) => {
    seedMeds()
    await open(page, '/quests', '2026-11-10T12:59:00Z') // 7:59 am
    await expect(overlay(page)).toHaveCount(0)
    await page.clock.runFor(2 * 60_000)
    await expect(overlay(page)).toBeVisible()
    await expect(page.getByTestId('priority-title')).toHaveText('Take medications')
    await expect(overlay(page)).toContainText(msg.priority.eyebrow)
    await expect(overlay(page)).toContainText(msg.priority.reliability)
  })

  test('it comes up above a window that is already open, and can be used there', async ({ page }) => {
    seedMeds()
    await open(page, '/habits', '2026-11-10T12:59:00Z') // 7:59 am
    await page.getByRole('button', { name: '+ Capture' }).click()
    const capture = page.getByRole('dialog', { name: msg.capture.windowLabel })
    await expect(capture).toBeVisible()
    await page.clock.runFor(2 * 60_000)
    await expect(overlay(page)).toBeVisible()
    // Escape and a click where the window's backdrop would be don't dismiss it; only acting on it does.
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    await expect(overlay(page)).toBeVisible()
    await overlay(page).getByRole('button', { name: msg.priority.snooze }).click()
    await expect(overlay(page)).toHaveCount(0)
    await expect(capture).toBeVisible()
  })

  test('slide to complete completes the habit for the day and closes the reminder', async ({ page }) => {
    seedMeds()
    await open(page, '/habits', '2026-11-10T13:05:00Z')
    await expect(overlay(page)).toBeVisible()
    await overlay(page).getByRole('slider', { name: msg.priority.slide }).fill('100')
    await expect(overlay(page)).toHaveCount(0)
    await expect.poll(() => server.written('habit_logs').find((l) => l.date === '2026-11-10')).toMatchObject({ habit_id: MEDS, status: 'completed' })
  })

  test('a partial slide does not complete it', async ({ page }) => {
    seedMeds()
    await open(page, '/', '2026-11-10T13:05:00Z')
    await overlay(page).getByRole('slider', { name: msg.priority.slide }).fill('60')
    await overlay(page).getByRole('slider', { name: msg.priority.slide }).dispatchEvent('change')
    await expect(overlay(page)).toBeVisible()
    expect(server.written('habit_logs')).toHaveLength(0)
  })

  test('Snooze hides it for 10 minutes, then it comes back', async ({ page }) => {
    test.skip(isSafari(test.info()), 'fast-forwarding many minutes takes over a minute on WebKit; the same logic runs on Chrome')
    seedMeds()
    await open(page, '/', '2026-11-10T13:05:00Z')
    await overlay(page).getByRole('button', { name: msg.priority.snooze }).click()
    await expect(overlay(page)).toHaveCount(0)
    await expect.poll(() => server.written('reminder_state').at(-1)).toMatchObject({ kind: 'habit', item_id: MEDS, date: '2026-11-10' })
    await page.clock.runFor(9 * 60_000)
    await expect(overlay(page)).toHaveCount(0)
    await page.clock.runFor(2 * 60_000)
    await expect(overlay(page)).toBeVisible()
  })

  test('Cancel stops it for today without completing the habit', async ({ page }) => {
    test.skip(isSafari(test.info()), 'fast-forwarding many minutes takes over a minute on WebKit; the same logic runs on Chrome')
    seedMeds()
    await open(page, '/', '2026-11-10T13:05:00Z')
    await overlay(page).getByRole('button', { name: msg.priority.cancel }).click()
    await expect(overlay(page)).toHaveCount(0)
    await page.clock.runFor(60 * 60_000)
    await expect(overlay(page)).toHaveCount(0)
    expect(server.written('habit_logs')).toHaveLength(0)
    await expect.poll(() => server.written('reminder_state').at(-1)?.cancelled_at).toBeTruthy()
  })

  test('a habit can be marked Priority in its editor', async ({ page }) => {
    seedMeds({ is_priority: false, title: 'Vitamins' })
    await open(page, '/habits', '2026-11-10T12:00:00Z')
    await page.getByRole('button', { name: /^Vitamins/ }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.heading })
    await dialog.getByRole('checkbox', { name: /Priority/ }).check()
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ title: 'Vitamins', is_priority: true })
    await expect(page.getByRole('button', { name: /^Vitamins/ }).getByText(msg.habits.priorityBadge, { exact: true })).toBeVisible()
  })
})

test.describe('Spec §5 High-priority tasks: a High task is a priority task', () => {
  test('a High task with a date can have a reminder time; it shows Priority, reminds full screen, and the slide crosses it off', async ({ page }) => {
    await open(page, '/tasks', '2026-11-10T16:55:00Z') // 11:55 am Tue
    await page.getByTestId('new-task').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.newHeading })
    await dialog.getByLabel(msg.tasks.editor.title).fill('Insulin before lunch')
    await expect(dialog.getByTestId('task-reminder')).toHaveCount(0)
    await dialog.getByRole('group', { name: msg.journal.priority }).getByRole('button', { name: msg.tasks.priority.high }).click()
    await dialog.getByLabel(msg.tasks.reminderLabel).fill('12:00')
    await dialog.getByRole('button', { name: msg.tasks.editor.save }).click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'Insulin before lunch', priority: 3, due_date: '2026-11-10', reminder_time: '12:00' })
    const row = page.getByRole('listitem').filter({ hasText: 'Insulin before lunch' })
    await expect(row.getByTestId('task-priority')).toContainText(msg.habits.priorityBadge)
    await expect(row.getByTestId('task-reminder-time')).toContainText('12:00 pm')

    await page.clock.runFor(6 * 60_000)
    await expect(page.getByTestId('priority-title')).toHaveText('Insulin before lunch')
    await overlay(page).getByRole('slider', { name: msg.priority.slide }).fill('100')
    await expect(overlay(page)).toHaveCount(0)
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'Insulin before lunch', status: 'done' })
  })

  test('a reminder already past is refused, and it is dropped when the task stops being High', async ({ page }) => {
    await open(page, '/tasks', '2026-11-10T14:20:00Z') // 9:20 am
    await page.getByTestId('new-task').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.newHeading })
    await dialog.getByLabel(msg.tasks.editor.title).fill('Call the pharmacy')
    const priority = dialog.getByRole('group', { name: msg.journal.priority })
    await priority.getByRole('button', { name: msg.tasks.priority.high }).click()
    await dialog.getByLabel(msg.tasks.reminderLabel).fill('08:00')
    await dialog.getByRole('button', { name: msg.tasks.editor.save }).click()
    await expect(dialog.getByTestId('field-error')).toHaveText(msg.tasks.reminderPast)
    expect(server.written('tasks')).toHaveLength(0)
    await priority.getByRole('button', { name: msg.tasks.priority.medium }).click()
    await expect(dialog.getByTestId('task-reminder')).toHaveCount(0)
    await dialog.getByRole('button', { name: msg.tasks.editor.save }).click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'Call the pharmacy', priority: 2, reminder_time: null })
  })
})

test.describe('Spec §6: reminder settings', { tag: '@phone' }, () => {
  test('quiet hours and the priority-in-quiet-hours choice are saved to my profile', async ({ page }) => {
    await open(page, '/account', '2026-11-10T12:00:00Z')
    const settings = page.getByTestId('notification-settings')
    await expect(page.getByTestId('account-group-reminders').getByRole('heading', { name: msg.notifications.heading, level: 2 })).toBeVisible()
    await settings.getByLabel(msg.notifications.quietStart, { exact: true }).fill('22:00')
    await settings.getByLabel(msg.notifications.quietEnd, { exact: true }).fill('07:00')
    await expect(settings.getByRole('checkbox', { name: /Priority reminders still ring/ })).toBeChecked()
    await settings.getByRole('button', { name: msg.notifications.save }).click()
    await expect(settings.getByText(msg.profile.saved)).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      quiet_hours_silence_priority: false,
    })
  })
})
