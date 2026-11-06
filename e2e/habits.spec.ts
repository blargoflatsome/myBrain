import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { goTo } from './support/nav'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

function habit(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    notify_time: null,
    timer_minutes: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start_date: '2026-11-10',
    is_private: false,
    current_streak: 0,
    best_streak: 0,
    ...extra,
  }
}
function log(habitId: string, date: string, status: 'completed' | 'missed' = 'completed') {
  return { id: `${habitId}-${date}`, habit_id: habitId, date, status, completed_at: status === 'completed' ? `${date}T15:00:00Z` : null }
}

async function open(page: Page, path = '/habits', time = NOW) {
  await page.clock.install({ time })
  await page.goto(path)
}
const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Habits', () => {
  test('the Habits page shows its intro line, worded exactly', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('habits-tagline')).toHaveText('You are only in competition with yourself.')
  })

  test('the Tasks page shows its heading and intro line', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks')
    await expect(page.getByTestId('tasks-intro')).toHaveText("Let's get these To-Done.")
  })

  test('a new habit has a title, reminder time, timer and weekdays; the timer starts at the reminder time', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await dialog.getByLabel('Title').fill('Stretch')
    await dialog.getByLabel('Reminder time (optional)').fill('08:00')
    await dialog.getByLabel('Timer').selectOption({ label: '2 hours' })
    await expect(dialog.getByRole('group', { name: 'Repeats on' }).getByRole('button', { pressed: true })).toHaveCount(7)
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Created today, so due by midnight today; the timer applies from tomorrow (SPEC §5 Habits).
    await expect(row(page, 'Stretch').getByTestId('habit-status')).toHaveText('Due today')
    await expect.poll(() => server.written('habits').at(-1)).toMatchObject({
      title: 'Stretch',
      notify_time: '08:00',
      timer_minutes: 120,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      is_private: false,
      start_date: '2026-11-10',
    })
  })

  test('bug fix: a habit created after its timer window is not missed on its first day', async ({ page }) => {
    await open(page, '/habits', new Date('2026-11-10T16:17:00Z')) // 11:17 am New York
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await dialog.getByLabel('Title').fill('Take Morning Pills')
    await dialog.getByLabel('Reminder time (optional)').fill('09:00')
    await dialog.getByLabel('Timer').selectOption({ label: '1 hour' })
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(row(page, 'Take Morning Pills').getByTestId('habit-status')).toHaveText('Due today')
    await expect(page.getByRole('button', { name: 'Mark Take Morning Pills done' })).toBeEnabled()
    await page.clock.runFor(2 * 60_000)
    expect(server.written('habit_logs').filter((l) => l.status === 'missed')).toEqual([])
  })

  test('a "missed" log saved too early on the first day is cleaned up', async ({ page }) => {
    server.seed('habits', [habit('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Take Morning Pills', { notify_time: '09:00:00', timer_minutes: 60 })])
    server.seed('habit_logs', [{ ...log('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', '2026-11-10', 'missed'), id: 'early-miss' }])
    await open(page, '/habits', new Date('2026-11-10T16:17:00Z'))
    await expect(row(page, 'Take Morning Pills').getByTestId('habit-status')).toHaveText('Due today')
    await expect.poll(() => server.written('habit_logs').find((l) => l.id === 'early-miss')?.deleted_at).toBeTruthy()
  })

  test('a timer needs a reminder time', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '+ New habit' }).click()
    await expect(page.getByRole('dialog', { name: 'New habit' }).getByLabel('Timer')).toBeDisabled()
  })

  test('completing builds the streak and best streak; it can be undone before the deadline', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Stretch', { start_date: '2026-11-08', current_streak: 2, best_streak: 2 })])
    server.seed('habit_logs', [log('h1', '2026-11-08'), log('h1', '2026-11-09')])
    await open(page)
    await expect(row(page, 'Stretch').getByTestId('habit-streak')).toHaveText('🔥 2 in a row')

    await page.getByRole('button', { name: 'Mark Stretch done' }).click()
    await expect(row(page, 'Stretch').getByTestId('habit-status')).toHaveText('Done today')
    await expect(row(page, 'Stretch').getByTestId('habit-streak')).toHaveText('🔥 3 in a row')
    await expect(row(page, 'Stretch').getByTestId('habit-best')).toHaveText('Best: 3')
    await expect(row(page, 'Stretch')).toContainText('New best! Past you would be impressed.')
    await expect.poll(() => server.written('habit_logs').at(-1)).toMatchObject({ habit_id: 'h1', date: '2026-11-10', status: 'completed' })

    await page.getByRole('button', { name: 'Undo Stretch' }).click()
    await expect(row(page, 'Stretch').getByTestId('habit-streak')).toHaveText('🔥 2 in a row')
    await expect.poll(() => server.written('habit_logs').at(-1)?.deleted_at).toBeTruthy()
  })

  test('if the timer expires first it counts as a miss: streak back to zero, best kept', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Meds', { notify_time: '08:00', timer_minutes: 60, start_date: '2026-11-08' })])
    server.seed('habit_logs', [log('h1', '2026-11-08'), log('h1', '2026-11-09')])
    await open(page, '/habits', new Date('2026-11-10T13:58:00Z')) // 8:58 am, due 9:00 am
    await expect(row(page, 'Meds').getByTestId('habit-status')).toHaveText('Due by 9:00 AM')

    await page.clock.runFor(3 * 60_000)
    await expect(row(page, 'Meds').getByTestId('habit-status')).toHaveText('Missed today')
    await expect(row(page, 'Meds')).toContainText('Past you missed this one.')
    await expect(row(page, 'Meds').getByTestId('habit-streak')).toHaveText('🔥 0 in a row')
    await expect(row(page, 'Meds').getByTestId('habit-best')).toHaveText('Best: 2')
    await expect(page.getByRole('button', { name: 'Mark Meds done' })).toBeDisabled()
    await expect.poll(() => server.written('habit_logs').find((l) => l.date === '2026-11-10')).toMatchObject({ status: 'missed' })
  })

  test('days missed while the app was closed are logged as missed', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Walk', { start_date: '2026-11-07' })])
    server.seed('habit_logs', [log('h1', '2026-11-08')])
    await open(page)
    await expect
      .poll(() => server.written('habit_logs').filter((l) => l.status === 'missed').map((l) => l.date).sort())
      .toEqual(['2026-11-07', '2026-11-09'])
    await expect(row(page, 'Walk').getByTestId('habit-best')).toHaveText('Best: 1')
  })

  test('a weekdays-only habit is under "Not today" on a Saturday', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Work standup prep', { weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-02' })])
    await open(page, '/habits', new Date('2026-11-14T15:00:00Z')) // Saturday
    await expect(page.getByRole('heading', { name: 'Not today' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0)
    await expect(page.getByText('Mon Tue Wed Thu Fri')).toBeVisible()
  })

  test('a habit can be deleted after confirming', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Old habit')])
    await open(page)
    await page.getByRole('button', { name: /^Old habit/ }).click()
    await page.getByRole('button', { name: 'Delete habit' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this habit?' })
    await expect(confirm).toContainText('"Old habit" and its streak history will be removed from all your devices.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(row(page, 'Old habit')).toHaveCount(0)
    await expect.poll(() => server.written('habits').at(-1)?.deleted_at).toBeTruthy()
  })
})

test.describe('Spec §5 Habits and Profile page: private habits', () => {
  test('a private habit is marked on the Habits page and never appears on the Profile page', async ({ page }) => {
    server.seed('habits', [
      habit('h1', 'Run', { start_date: '2026-11-07' }),
      habit('h2', 'Take meds', { is_private: true, start_date: '2026-11-01' }),
    ])
    server.seed('habit_logs', [
      ...['2026-11-07', '2026-11-08', '2026-11-09'].map((d) => log('h1', d)),
      ...['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) => log('h2', `2026-11-${d}`)),
    ])
    await open(page)
    await expect(row(page, 'Take meds')).toContainText('🔒 Private')

    await goTo(page, 'Profile')
    await expect(page.getByTestId('profile-streak')).toHaveCount(1)
    await expect(page.getByTestId('profile-streak')).toContainText('Run')
    await expect(page.getByText('Take meds')).toHaveCount(0)
    await expect(page.getByTestId('longest-streak')).toHaveText('🏆 Longest streak ever: 3 (Run)')
  })

  test('new habits are not private by default, and can be made private', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await expect(dialog.getByRole('checkbox', { name: /Private/ })).not.toBeChecked()
    await dialog.getByLabel('Title').fill('Journal privately')
    await dialog.getByRole('checkbox', { name: /Private/ }).check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ title: 'Journal privately', is_private: true })
  })
})

test.describe('Spec §5 Profile page', () => {
  test('shows my name, lets me edit name and bio, and streaks are private (only me) by default', async ({ page }) => {
    await open(page, '/profile')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test Person')
    await expect(page.getByLabel('Who can see my streaks')).toHaveValue('private')
    await expect(page.getByText('Sharing starts when other people can join My Brain.')).toBeVisible()

    await page.getByLabel('Short bio').fill('Collector of small wins.')
    await page.getByLabel('Who can see my streaks').selectOption('everyone')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Saved. Past you would approve.')).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({ bio: 'Collector of small wins.', streak_visibility: 'everyone' })
  })

  test('sign out lives on the Profile page', async ({ page }) => {
    await open(page, '/profile')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})

test.describe('Navigation', () => {
  test('the left menu reaches Tasks, Habits, Quests, Inbox and Profile, with text labels only', async ({ page }) => {
    await open(page, '/')
    for (const [name, url] of [
      ['Habits', /\/habits$/],
      ['Quests', /\/quests$/],
      ['Inbox', /\/inbox$/],
      ['Profile', /\/profile$/],
      ['Tasks', /\/$/],
    ] as const) {
      await goTo(page, name)
      await expect(page).toHaveURL(url)
    }
    const menu = page.getByRole('button', { name: 'Menu' })
    if (await menu.isVisible()) await menu.click()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
      'My Brain',
      'Tasks',
      'Habits',
      'Routines',
      'Quests',
      'Inbox',
      'Profile',
    ])
  })

  test('on a phone the menu is closed until Menu is tapped, and closes after choosing a page', async ({ page }, info) => {
    test.skip(info.project.name !== 'android-phone', 'phone-only behaviour')
    await open(page, '/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav).toBeHidden()
    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(nav).toBeVisible()
    await nav.getByRole('link', { name: 'Habits' }).click()
    await expect(page).toHaveURL(/\/habits$/)
    await expect(nav).toBeHidden()
  })

  test('on a wider screen the menu is always shown on the left', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'desktop-only behaviour')
    await open(page, '/')
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden()
    const box = await page.getByRole('navigation', { name: 'Main' }).boundingBox()
    expect(box?.x).toBe(0)
  })
})
