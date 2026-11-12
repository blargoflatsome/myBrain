import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isPhone } from '../support/devices'
import { goTo, mainNav } from '../support/nav'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 pm.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T02:00:00Z')
let server: FakeSupabase

async function open(page: Page, path = '/') {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const habit = (id: string, title: string, start: string) => ({
  id,
  title,
  notify_time: null,
  timer_minutes: null,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: start,
  is_private: false,
  current_streak: 0,
  best_streak: 0,
})

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Dashboard', () => {
  test('"How past you did yesterday" is the first section without Post Its: habits, routines and tasks from yesterday', async ({ page }) => {
    const Y = '2026-11-09'
    server.seed('tasks', [
      { id: 't1', title: 'Pay rent', due_date: Y, status: 'done', completed_at: `${Y}T18:00:00Z`, priority: 1, source: 'manual' },
      { id: 't2', title: 'Email Sam', due_date: Y, status: 'open', priority: 1, source: 'manual' },
      { id: 't3', title: 'Today only', due_date: '2026-11-10', status: 'open', priority: 1, source: 'manual' },
    ])
    server.seed('habits', [habit('h1', 'Meds', '2026-11-01'), habit('h2', 'Stretch', '2026-11-01')])
    server.seed('habit_logs', [{ id: 'h1-y', habit_id: 'h1', date: Y, status: 'completed', completed_at: `${Y}T15:00:00Z` }])
    server.seed('routines', [
      { id: 'r1', title: 'Morning', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' },
      { id: 'r2', title: 'Night', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' },
    ])
    server.seed('routine_steps', [
      ...['Wake', 'Teeth'].map((title, i) => ({ id: `m${i}`, routine_id: 'r1', position: i, title, start_date: '2026-11-01' })),
      ...['Floss', 'Read', 'Lights out'].map((title, i) => ({ id: `n${i}`, routine_id: 'r2', position: i, title, start_date: '2026-11-01' })),
    ])
    server.seed('routine_runs', [
      { id: 'run1', routine_id: 'r1', date: Y, started_at: `${Y}T12:00:00Z`, finished_at: `${Y}T12:10:00Z` },
      { id: 'run2', routine_id: 'r2', date: Y, started_at: `${Y}T23:00:00Z`, finished_at: null },
    ])
    server.seed('routine_step_logs', [
      { id: 'l1', run_id: 'run1', step_id: 'm0', status: 'completed', logged_at: `${Y}T12:00:00Z` },
      { id: 'l2', run_id: 'run1', step_id: 'm1', status: 'completed', logged_at: `${Y}T12:05:00Z` },
      { id: 'l3', run_id: 'run2', step_id: 'n0', status: 'completed', logged_at: `${Y}T23:00:00Z` },
    ])
    await open(page)
    const section = page.getByTestId('dash-yesterday')
    await expect(section.getByRole('heading', { name: msg.dashboard.yesterdayHeading })).toBeVisible()
    await expect(page.locator('main section').first()).toHaveAttribute('data-testid', 'dash-yesterday')
    await expect(section.getByTestId('dash-yesterday-habits')).toHaveText('1 of 2')
    await expect(section.getByTestId('dash-yesterday-routines')).toHaveText('1 of 2')
    await expect(section.getByTestId('dash-yesterday-tasks')).toHaveText('1 of 2')
    await expect(section.getByTestId('dash-yesterday-routine')).toHaveText(['✓ Morning 2/2', 'Night 1/3'])
  })

  test('on a wide screen, How past you did yesterday sits to the left of the Post Its; on a narrower one, below them', async ({ page }, info) => {
    test.skip(isPhone(info), 'computer widths')
    server.seed('post_its', [{ id: 'p1', body: '<p>Call the vet</p>', color: 'yellow', position: 0 }])
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    const yesterday = page.getByTestId('dash-yesterday')
    const notes = page.getByTestId('dash-postits')
    await expect(notes).toBeVisible()
    let y = (await yesterday.boundingBox())!
    let n = (await notes.boundingBox())!
    expect(y.x + y.width).toBeLessThanOrEqual(n.x)
    expect(Math.abs(y.y - n.y)).toBeLessThan(40)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

    await page.setViewportSize({ width: 1100, height: 900 })
    await expect.poll(async () => (await yesterday.boundingBox())!.y > (await notes.boundingBox())!.y + (await notes.boundingBox())!.height - 1).toBe(true)
    y = (await yesterday.boundingBox())!
    n = (await notes.boundingBox())!
    expect(y.y).toBeGreaterThanOrEqual(n.y + n.height - 1)
  })

  test('without Post Its, How past you did yesterday takes the full width on a wide screen', async ({ page }, info) => {
    test.skip(isPhone(info), 'computer widths')
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    const top = (await page.getByTestId('dash-top').boundingBox())!
    const y = (await page.getByTestId('dash-yesterday').boundingBox())!
    expect(y.width).toBeGreaterThan(top.width - 2)
  })

  test('the app opens on the Dashboard, the first item in the menu', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    // The Dashboard is home: "My Brain" goes there, and it isn't a tab or menu item of its own.
    await expect(mainNav(page).getByRole('link', { name: msg.dashboard.heading })).toHaveCount(0)
    await page.goto('/tasks')
    await goTo(page, 'Dashboard')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
  })
})
