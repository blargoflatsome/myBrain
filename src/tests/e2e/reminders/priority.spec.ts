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
      is_private: true,
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
    await expect(page.getByRole('button', { name: /^Vitamins/ }).getByText(msg.priority.tabHeading, { exact: true })).toBeVisible()
  })
})

test.describe('Spec §5: priority tasks, one-off or repeating', () => {
  test('a repeating priority task is added under Tasks > Priority and reminds at its time', async ({ page }) => {
    await open(page, '/tasks', '2026-11-10T16:55:00Z') // 11:55 am Tue
    await page.getByRole('tab', { name: msg.priority.tabHeading }).click()
    await expect(page.getByText("Past you hasn't added any priority tasks yet.")).toBeVisible()
    await page.getByRole('button', { name: msg.priority.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.priority.editor.newHeading })
    await dialog.getByLabel(msg.priority.editor.title).fill('Insulin before lunch')
    await dialog.getByRole('textbox', { name: msg.priority.editor.description }).fill('Fridge, top shelf')
    await dialog.getByLabel(msg.priority.editor.time).fill('12:00')
    await dialog.getByRole('group', { name: msg.priority.editor.repeat }).getByRole('button', { name: 'Sat' }).click()
    await dialog.getByRole('group', { name: msg.priority.editor.repeat }).getByRole('button', { name: 'Sun' }).click()
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByTestId('priority-when')).toHaveText(`${msg.priority.repeats('Mon Tue Wed Thu Fri')} at 12:00 pm`)
    await expect.poll(() => server.written('priority_tasks')[0]).toMatchObject({ reminder_time: '12:00', due_date: null, weekdays: [1, 2, 3, 4, 5] })

    await page.clock.runFor(6 * 60_000)
    await expect(page.getByTestId('priority-title')).toHaveText('Insulin before lunch')
    await expect(overlay(page)).toContainText('Fridge, top shelf')
    await overlay(page).getByRole('slider', { name: msg.priority.slide }).fill('100')
    await expect(overlay(page)).toHaveCount(0)
    await expect.poll(() => server.written('priority_task_logs')[0]).toMatchObject({ date: '2026-11-10' })
  })

  test('a one-off priority task can be set for a single date', async ({ page }) => {
    await open(page, '/tasks', '2026-11-10T12:00:00Z')
    await page.getByRole('tab', { name: msg.priority.tabHeading }).click()
    await page.getByRole('button', { name: msg.priority.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.priority.editor.newHeading })
    await dialog.getByLabel(msg.priority.editor.title).fill('Booster shot')
    await dialog.getByLabel(msg.priority.editor.time).fill('09:30')
    await dialog.getByRole('group', { name: msg.priority.editor.when }).getByRole('button', { name: msg.priority.editor.once }).click()
    await dialog.getByLabel(msg.priority.editor.date).fill('2026-11-20')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(page.getByTestId('priority-when')).toHaveText('Once, on Fri, Nov 20 at 9:30 am')
    await expect.poll(() => server.written('priority_tasks')[0]).toMatchObject({ due_date: '2026-11-20', weekdays: null })
  })
})

test.describe('Spec §6: reminder settings', { tag: '@phone' }, () => {
  test('ntfy topic, quiet hours and the priority-in-quiet-hours choice are saved to my profile', async ({ page }) => {
    await open(page, '/account', '2026-11-10T12:00:00Z')
    const settings = page.getByTestId('notification-settings')
    await expect(page.getByTestId('account-group-reminders').getByRole('heading', { name: msg.notifications.heading, level: 2 })).toBeVisible()
    await settings.getByRole('checkbox', { name: /Also send to the ntfy app/ }).check()
    await settings.getByRole('button', { name: msg.notifications.ntfyMake }).click()
    await expect(settings.getByLabel(msg.notifications.ntfyTopic)).toHaveValue(/^mybrain-[0-9a-f]{36}$/)
    await settings.getByLabel(msg.notifications.quietStart, { exact: true }).fill('22:00')
    await settings.getByLabel(msg.notifications.quietEnd, { exact: true }).fill('07:00')
    await expect(settings.getByRole('checkbox', { name: /Priority reminders still ring/ })).toBeChecked()
    await settings.getByRole('button', { name: msg.notifications.save }).click()
    await expect(settings.getByText(msg.notifications.saved)).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({
      notify_ntfy: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      quiet_hours_silence_priority: false,
    })
    expect(String(server.written('profiles').at(-1)?.ntfy_topic)).toMatch(/^mybrain-[0-9a-f]{36}$/)
  })
})
