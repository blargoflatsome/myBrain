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
function daysFrom(from: string, count: number) {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  for (let i = 0; i < count; i++, d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10))
  return out
}

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

  test('with nothing scheduled yesterday, the section says so', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('dash-yesterday')).toContainText(msg.dashboard.yesterdayEmpty)
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

  test('habit stats: streaks for every habit, most missed, longest current, best ever, oldest', async ({ page }) => {
    server.seed('habits', [habit('h1', 'Meds', '2026-10-01'), habit('h2', 'Stretch', '2026-11-01'), habit('h3', 'Read', '2025-03-01')])
    server.seed('habit_logs', [
      ...daysFrom('2026-10-01', 41).map((d) => ({ id: `h1-${d}`, habit_id: 'h1', date: d, status: 'completed', completed_at: `${d}T15:00:00Z` })),
      ...daysFrom('2026-11-01', 5).map((d) => ({ id: `h2-${d}`, habit_id: 'h2', date: d, status: 'completed', completed_at: `${d}T15:00:00Z` })),
    ])
    await open(page)
    await expect(page.getByTestId('dash-longest-current')).toContainText('41')
    await expect(page.getByTestId('dash-longest-current')).toContainText('Meds')
    await expect(page.getByTestId('dash-best-ever')).toContainText('41')
    await expect(page.getByTestId('dash-oldest')).toContainText('Read')
    await expect(page.getByTestId('dash-oldest')).toContainText('Since Mar 1, 2025')
    const missed = page.getByTestId('dash-most-missed')
    await expect(missed).toContainText('Read')
    await expect(missed).toContainText('Stretch')
    await expect(page.getByTestId('dash-habit')).toHaveCount(3)
    await expect(page.getByTestId('dash-habit').first()).toContainText('41 now · best 41')
  })

  test('journal streaks count only days I wrote', async ({ page }) => {
    server.seed('journal_entries', [
      ...['2026-11-01', '2026-11-02', '2026-11-03'].map((date) => ({ id: date, date, body: '<p>wrote</p>', stats: {}, stats_final: true, auto: false })),
      { id: 'a', date: '2026-11-08', body: '', stats: {}, stats_final: true, auto: true },
      ...['2026-11-09', '2026-11-10'].map((date) => ({ id: date, date, body: '<p>wrote</p>', stats: {}, stats_final: false, auto: false })),
    ])
    await open(page)
    await expect(page.getByTestId('dash-journal-current')).toHaveText('2')
    await expect(page.getByTestId('dash-journal-best')).toHaveText('3')
  })

  test('event stats, and the period dropdown (This year by default, Last 12 months, All time)', async ({ page }) => {
    const ev = (id: string, date: string, created: string, extra: Record<string, unknown> = {}) => ({
      id,
      title: id,
      notes: null,
      start_date: date,
      start_time: '10:00:00',
      end_date: date,
      end_time: '11:00:00',
      repeat: 'never',
      reminder_minutes: null,
      created_at: created,
      ...extra,
    })
    server.seed('events', [
      ev('this-year', '2026-03-01', '2026-02-01T12:00:00Z'),
      ev('last-december', '2025-12-15', '2025-12-01T12:00:00Z'),
      ev('long-ago', '2024-06-01', '2024-05-01T12:00:00Z'),
      ev('cancelled', '2026-12-01', '2026-10-01T12:00:00Z', { deleted_at: '2026-10-05T12:00:00Z' }),
    ])
    server.seed('tasks', [
      { id: 't1', title: 'a', due_date: null, priority: 1, status: 'done', completed_at: '2026-05-01T12:00:00Z', source: 'manual' },
      { id: 't2', title: 'b', due_date: null, priority: 1, status: 'done', completed_at: '2025-12-20T12:00:00Z', source: 'manual' },
    ])
    await open(page)
    await expect(page.getByLabel(msg.dashboard.period)).toHaveValue('year')
    await expect(page.getByTestId('dash-events-created')).toHaveText('2')
    await expect(page.getByTestId('dash-events-attended')).toHaveText('1')
    await expect(page.getByTestId('dash-events-cancelled')).toHaveText('1')
    await expect(page.getByTestId('dash-tasks')).toHaveText('1')

    await page.getByLabel(msg.dashboard.period).selectOption({ label: 'Last 12 months' })
    await expect(page.getByTestId('dash-events-attended')).toHaveText('2')
    await expect(page.getByTestId('dash-tasks')).toHaveText('2')

    await page.getByLabel(msg.dashboard.period).selectOption({ label: 'All time' })
    await expect(page.getByTestId('dash-events-created')).toHaveText('4')
    await expect(page.getByTestId('dash-events-attended')).toHaveText('3')
  })

  test('routines show their completion rate; quests finished are counted', async ({ page }) => {
    server.seed('routines', [{ id: 'r1', title: 'Morning', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' }])
    server.seed('routine_steps', [{ id: 's1', routine_id: 'r1', position: 0, title: 'Wake', start_date: '2026-11-01' }])
    server.seed('routine_runs', [{ id: 'run1', routine_id: 'r1', date: '2026-11-02', started_at: '2026-11-02T12:00:00Z', finished_at: '2026-11-02T12:10:00Z' }])
    server.seed('quests', [{ id: 'q1', title: 'Bake', status: 'open', completed_at: '2026-11-02T12:00:00Z' }])
    server.seed('quest_logs', [{ id: 'ql1', quest_id: 'q1', date: '2026-11-02', completed_at: '2026-11-02T12:00:00Z' }])
    await open(page)
    await expect(page.getByRole('meter', { name: 'Morning' })).toHaveAttribute('aria-valuenow', '11') // 1 of 9 days
    await expect(page.getByTestId('dash-quests')).toHaveText('1')
  })

  test('with nothing yet, it says so kindly', async ({ page }) => {
    await open(page)
    await expect(page.getByText("Past you hasn't started any habits yet.")).toBeVisible()
  })
})
