import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'
import { isPhone } from './support/devices'
import { goTo, openMore } from './support/nav'

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
    await expect(row(page, 'Stretch').getByTestId('habit-streak')).toHaveText('2 in a row')

    await page.getByRole('button', { name: 'Mark Stretch done' }).click()
    await expect(row(page, 'Stretch').getByTestId('habit-status')).toHaveText('Done today')
    await expect(row(page, 'Stretch').getByTestId('habit-streak')).toHaveText('3 in a row')
    await expect(row(page, 'Stretch').getByTestId('habit-best')).toHaveText('Best: 3')
    await expect(row(page, 'Stretch')).toContainText('New best! Way to make past you look like a chump!')
    await expect.poll(() => server.written('habit_logs').at(-1)).toMatchObject({ habit_id: 'h1', date: '2026-11-10', status: 'completed' })

    await page.getByRole('button', { name: 'Undo Stretch' }).click()
    await expect(row(page, 'Stretch').getByTestId('habit-streak')).toHaveText('2 in a row')
    await expect.poll(() => server.written('habit_logs').at(-1)?.deleted_at).toBeTruthy()
  })

  test('if the timer expires first it counts as a miss: streak back to zero, best kept', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Meds', { notify_time: '08:00', timer_minutes: 60, start_date: '2026-11-08' })])
    server.seed('habit_logs', [log('h1', '2026-11-08'), log('h1', '2026-11-09')])
    await open(page, '/habits', new Date('2026-11-10T13:58:00Z')) // 8:58 am, due 9:00 am
    await expect(row(page, 'Meds').getByTestId('habit-status')).toHaveText('Due by 9:00 am')

    await page.clock.runFor(3 * 60_000)
    await expect(row(page, 'Meds').getByTestId('habit-status')).toHaveText('Missed today')
    await expect(row(page, 'Meds')).toContainText('Past you missed this one!')
    await expect(row(page, 'Meds').getByTestId('habit-streak')).toHaveText('0 in a row')
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
  test('a private habit is marked on the Habits page; streaks are on the Dashboard, not the Account page', async ({ page }) => {
    server.seed('habits', [
      habit('h1', 'Run', { start_date: '2026-11-07' }),
      habit('h2', 'Take meds', { is_private: true, start_date: '2026-11-01' }),
    ])
    server.seed('habit_logs', [
      ...['2026-11-07', '2026-11-08', '2026-11-09'].map((d) => log('h1', d)),
      ...['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) => log('h2', `2026-11-${d}`)),
    ])
    await open(page)
    await expect(row(page, 'Take meds')).toContainText('Private')

    await goTo(page, 'Account')
    await expect(page.getByTestId('profile-streak')).toHaveCount(0)
    await expect(page.getByText('Take meds')).toHaveCount(0)
    await goTo(page, 'Dashboard')
    await expect(page.getByTestId('dash-habit')).toHaveCount(2)
  })

  test('new habits are not private by default, and can be made private', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '+ New habit' }).click()
    const dialog = page.getByRole('dialog', { name: 'New habit' })
    await dialog.getByText('More details').click()
    await expect(dialog.getByRole('checkbox', { name: /Private/ })).not.toBeChecked()
    await dialog.getByLabel('Title').fill('Journal privately')
    await dialog.getByRole('checkbox', { name: /Private/ }).check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ title: 'Journal privately', is_private: true })
  })
})

test.describe('Spec §5 Account page', () => {
  test('shows my name, lets me edit it, and streaks are private (only me) by default; there is no bio', async ({ page }) => {
    await open(page, '/account')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test Person')
    await expect(page.getByLabel('Who can see my streaks')).toHaveValue('private')
    await expect(page.getByText('Sharing starts later. Private habits are never shown.')).toBeVisible()

    await expect(page.getByLabel('Short bio')).toHaveCount(0)
    await page.getByLabel('Display name').fill('Jo')
    await page.getByLabel('Who can see my streaks').selectOption('everyone')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
    expect(server.written('profiles').at(-1)).toMatchObject({ display_name: 'Jo', streak_visibility: 'everyone' })
  })

  test('Spec §9: Delete My Account confirms first, then deletes everything and signs me out', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: 'Delete My Account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await expect(dialog).toContainText('It cannot be undone.')
    const confirm = dialog.getByRole('button', { name: 'Delete everything' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Type DELETE to confirm').fill('delete')
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByRole('status')).toHaveText('Your account and all of its data have been deleted.')
    // Only reads besides the deletion (the Account page also checks which saved people use My Brain).
    expect(server.rpcCalls.filter((c) => c !== 'people_with_accounts')).toEqual(['delete_my_account'])
    // This device's copy is gone too.
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
    expect(names.filter((n) => n?.startsWith('my-brain-'))).toEqual([])
  })

  test('Spec §2: choosing Keep my account deletes nothing', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: 'Delete My Account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await dialog.getByRole('button', { name: 'Keep my account' }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/account$/)
    expect(server.rpcCalls.filter((c) => c !== 'people_with_accounts')).toEqual([])
  })

  test('Spec §9: if deletion fails, I am told and stay signed in', async ({ page }) => {
    server.failRpc = true
    await open(page, '/account')
    await page.getByRole('button', { name: 'Delete My Account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
    await dialog.getByRole('button', { name: 'Delete everything' }).click()
    await expect(dialog.getByRole('alert')).toHaveText("Couldn't delete your account. Check your connection and try again.")
    await expect(page).toHaveURL(/\/account$/)
  })

  test('sign out lives on the Account page', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })
})

test.describe('Navigation', () => {
  test('the left menu reaches Dashboard, Tasks, Habits, Quests, Orphans and Account, with text labels only', async ({ page }) => {
    await open(page, '/')
    for (const [name, url] of [
      ['Habits', /\/habits$/],
      ['Quests', /\/quests$/],
      ['Orphans', /\/orphans$/],
      ['Account', /\/account$/],
      ['Tasks', /\/tasks$/],
      ['Dashboard', /\/$/],
    ] as const) {
      await goTo(page, name)
      await expect(page).toHaveURL(url)
    }
    // The four main places, then everything else under More (SPEC §2 Navigation).
    const main = page.locator('nav[aria-label="Main"]:visible').getByRole('link')
    await expect(main.filter({ hasText: /^(Tasks|Habits|Calendar|The Vault)$/ })).toHaveText(['Tasks', 'Habits', 'Calendar', 'The Vault'])
    await openMore(page)
    const sheet = page.getByRole('dialog', { name: 'More' })
    const moreLinks = (await sheet.isVisible()) ? sheet.getByRole('link') : page.locator('#nav-more').getByRole('link')
    await expect(moreLinks).toHaveText(['Routines', 'Journal', 'Quests', /^Orphans/, 'Connections', 'Account'])
  })

  test('on a phone, tabs along the bottom: Tasks, Habits, Calendar, The Vault and More; More opens the rest', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone-only behaviour')
    await open(page, '/')
    const tabs = page.getByTestId('bottom-tabs')
    await expect(tabs.getByRole('link')).toHaveText(['Tasks', 'Habits', 'Calendar', 'The Vault'])
    const box = await tabs.boundingBox()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual((page.viewportSize()?.height ?? 0) - 1)
    await tabs.getByRole('link', { name: 'Habits' }).click()
    await expect(page).toHaveURL(/\/habits$/)
    await expect(tabs.getByRole('link', { name: 'Habits' })).toHaveAttribute('aria-current', 'page')
    await tabs.getByRole('button', { name: /^More/ }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await sheet.getByRole('link', { name: 'Journal' }).click()
    await expect(page).toHaveURL(/\/journal$/)
    await expect(sheet).toBeHidden()
    await expect(tabs.getByRole('button', { name: /^More/ })).toHaveAttribute('aria-current', 'page')
    // There's no Menu button any more.
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  })

  test('on a wider screen the menu is always shown on the left', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'desktop-only behaviour')
    await open(page, '/')
    await expect(page.getByTestId('bottom-tabs')).toBeHidden()
    const nav = page.locator('nav[aria-label="Main"]:visible')
    const box = await nav.boundingBox()
    expect(box?.x).toBe(0)
    // More opens the rest right there, and stays as I left it.
    const more = nav.getByRole('button', { name: /^More/ })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(page.locator('#nav-more').getByRole('link', { name: 'Journal' })).toBeVisible()
    await page.reload()
    await expect(page.locator('nav[aria-label="Main"]:visible').getByRole('button', { name: /^More/ })).toHaveAttribute('aria-expanded', 'true')
  })
})
