import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { isSafari } from './support/devices'

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
const overlay = (page: Page) => page.getByRole('alertdialog', { name: 'Priority reminder' })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5: full-screen reminder for priority habits', () => {
  test('appears at the reminder time on any screen, with the reliability notice', async ({ page }) => {
    seedMeds()
    await open(page, '/quests', '2026-11-10T12:59:00Z') // 7:59 am
    await expect(overlay(page)).toHaveCount(0)
    await page.clock.runFor(2 * 60_000)
    await expect(overlay(page)).toBeVisible()
    await expect(page.getByTestId('priority-title')).toHaveText('Take medications')
    await expect(overlay(page)).toContainText('Past you claims this is important')
    await expect(overlay(page)).toContainText('Phone reminders can arrive late')
  })

  test('slide to complete completes the habit for the day and closes the reminder', async ({ page }) => {
    seedMeds()
    await open(page, '/habits', '2026-11-10T13:05:00Z')
    await expect(overlay(page)).toBeVisible()
    await overlay(page).getByRole('slider', { name: 'Slide to complete' }).fill('100')
    await expect(overlay(page)).toHaveCount(0)
    await expect.poll(() => server.written('habit_logs').find((l) => l.date === '2026-11-10')).toMatchObject({ habit_id: MEDS, status: 'completed' })
  })

  test('a partial slide does not complete it', async ({ page }) => {
    seedMeds()
    await open(page, '/', '2026-11-10T13:05:00Z')
    await overlay(page).getByRole('slider', { name: 'Slide to complete' }).fill('60')
    await overlay(page).getByRole('slider', { name: 'Slide to complete' }).dispatchEvent('change')
    await expect(overlay(page)).toBeVisible()
    expect(server.written('habit_logs')).toHaveLength(0)
  })

  test('Snooze hides it for 10 minutes, then it comes back', async ({ page }) => {
    test.skip(isSafari(test.info()), 'fast-forwarding many minutes takes over a minute on WebKit; the same logic runs on Chrome')
    seedMeds()
    await open(page, '/', '2026-11-10T13:05:00Z')
    await overlay(page).getByRole('button', { name: 'Snooze 10 min' }).click()
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
    await overlay(page).getByRole('button', { name: 'Cancel for today' }).click()
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
    const dialog = page.getByRole('dialog', { name: 'Edit habit' })
    await dialog.getByRole('checkbox', { name: /Priority/ }).check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ title: 'Vitamins', is_priority: true })
    await expect(page.getByRole('button', { name: /^Vitamins/ }).getByText('Priority', { exact: true })).toBeVisible()
  })
})

test.describe('Spec §5: priority tasks, one-off or repeating', () => {
  test('a repeating priority task is added under Tasks > Priority and reminds at its time', async ({ page }) => {
    await open(page, '/tasks', '2026-11-10T16:55:00Z') // 11:55 am Tue
    await page.getByRole('tab', { name: 'Priority' }).click()
    await expect(page.getByText("Past you hasn't added any priority tasks yet.")).toBeVisible()
    await page.getByRole('button', { name: '+ New priority task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New priority task' })
    await dialog.getByLabel('Title').fill('Insulin before lunch')
    await dialog.getByTestId('priority-more').getByText('More details').click()
    await dialog.getByRole('textbox', { name: 'Details (optional)' }).fill('Fridge, top shelf')
    await dialog.getByLabel('Reminder time').fill('12:00')
    await dialog.getByRole('group', { name: 'Repeats' }).getByRole('button', { name: 'Sat' }).click()
    await dialog.getByRole('group', { name: 'Repeats' }).getByRole('button', { name: 'Sun' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('priority-when')).toHaveText('Repeats Mon Tue Wed Thu Fri at 12:00 pm')
    await expect.poll(() => server.written('priority_tasks')[0]).toMatchObject({ reminder_time: '12:00', due_date: null, weekdays: [1, 2, 3, 4, 5] })

    await page.clock.runFor(6 * 60_000)
    await expect(page.getByTestId('priority-title')).toHaveText('Insulin before lunch')
    await expect(overlay(page)).toContainText('Fridge, top shelf')
    await overlay(page).getByRole('slider', { name: 'Slide to complete' }).fill('100')
    await expect(overlay(page)).toHaveCount(0)
    await expect.poll(() => server.written('priority_task_logs')[0]).toMatchObject({ date: '2026-11-10' })
  })

  test('a one-off priority task can be set for a single date', async ({ page }) => {
    await open(page, '/tasks', '2026-11-10T12:00:00Z')
    await page.getByRole('tab', { name: 'Priority' }).click()
    await page.getByRole('button', { name: '+ New priority task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New priority task' })
    await dialog.getByLabel('Title').fill('Booster shot')
    await dialog.getByLabel('Reminder time').fill('09:30')
    await dialog.getByRole('group', { name: 'When' }).getByRole('button', { name: 'One time' }).click()
    await dialog.getByLabel('Date').fill('2026-11-20')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('priority-when')).toHaveText('Once, on Fri, Nov 20 at 9:30 am')
    await expect.poll(() => server.written('priority_tasks')[0]).toMatchObject({ due_date: '2026-11-20', weekdays: null })
  })
})

test.describe('Spec §6: reminder settings', () => {
  test('ntfy topic, quiet hours and the priority-in-quiet-hours choice are saved to my profile', async ({ page }) => {
    await open(page, '/account', '2026-11-10T12:00:00Z')
    const settings = page.getByTestId('notification-settings')
    await expect(page.getByTestId('account-group-reminders').getByRole('heading', { name: 'Reminders', level: 2 })).toBeVisible()
    await settings.getByRole('checkbox', { name: /Also send to the ntfy app/ }).check()
    await settings.getByRole('button', { name: 'Make a private topic' }).click()
    await expect(settings.getByLabel('Your private ntfy topic')).toHaveValue(/^mybrain-[0-9a-f]{36}$/)
    await settings.getByLabel('From', { exact: true }).fill('22:00')
    await settings.getByLabel('Until', { exact: true }).fill('07:00')
    await expect(settings.getByRole('checkbox', { name: /Priority reminders still ring/ })).toBeChecked()
    await settings.getByRole('button', { name: 'Save reminder settings' }).click()
    await expect(settings.getByText('Saved.')).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({
      notify_ntfy: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      quiet_hours_silence_priority: false,
    })
    expect(String(server.written('profiles').at(-1)?.ntfy_topic)).toMatch(/^mybrain-[0-9a-f]{36}$/)
  })
})
