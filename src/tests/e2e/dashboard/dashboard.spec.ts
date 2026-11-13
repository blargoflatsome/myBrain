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
  current_streak: 0,
  best_streak: 0,
})

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Dashboard', () => {
  test('"How past you did yesterday": habits, routines and tasks from yesterday', async ({ page }) => {
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
    // Without Post Its, Days since your worst day is at the top, then Up next, then yesterday (SPEC §5 Dashboard).
    await expect(page.getByTestId('dash-yesterday')).toBeVisible()
    const order = await page.locator('main section[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(order.slice(0, 3)).toEqual(['dash-key', 'up-next', 'dash-yesterday'])
    await expect(section.getByTestId('dash-yesterday-habits')).toHaveText('1 of 2')
    await expect(section.getByTestId('dash-yesterday-routines')).toHaveText('1 of 2')
    await expect(section.getByTestId('dash-yesterday-tasks')).toHaveText('1 of 2')
    await expect(section.getByTestId('dash-yesterday-routine')).toHaveText(['✓ Morning 2/2', 'Night 1/3'])
  })

  test('Days since your worst day sits to the left of the Post Its; on a phone, above them', async ({ page }, info) => {
    test.skip(isPhone(info), 'sets its own widths')
    server.seed('post_its', [{ id: 'p1', body: '<p>Call the vet</p>', color: 'yellow', position: 0 }])
    await page.setViewportSize({ width: 1024, height: 900 })
    await open(page)
    const pad = page.getByTestId('dash-key')
    const notes = page.getByTestId('dash-postits')
    await expect(notes).toBeVisible()
    const p = (await pad.boundingBox())!
    const n = (await notes.boundingBox())!
    expect(p.x + p.width).toBeLessThanOrEqual(n.x)
    // Side by side on the one chalkboard: the count is level with the Post Its.
    expect(p.y + p.height / 2).toBeGreaterThan(n.y)
    expect(p.y + p.height / 2).toBeLessThan(n.y + n.height)
    await expect(page.getByTestId('dash-top').getByTestId('dash-postits')).toBeVisible()

    await page.setViewportSize({ width: 390, height: 900 })
    await expect.poll(async () => (await notes.boundingBox())!.y >= (await pad.boundingBox())!.y + (await pad.boundingBox())!.height - 1).toBe(true)
    // On a phone a short Post It still fills the board's width, not just its words.
    const board = (await page.getByTestId('dash-top').boundingBox())!
    const note = (await page.getByTestId('postit-carousel').boundingBox())!
    expect(note.width).toBeGreaterThan(board.width - 60)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
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

// SPEC §5 Dashboard Up next and yesterday's leftovers (the order of suggestions is in src/tests/unit/dashboard/up-next.test.ts).
const task = (id: string, title: string, due: string, extra: Record<string, unknown> = {}) => ({ id, title, due_date: due, status: 'open', priority: 1, source: 'manual', created_at: '2026-11-01T00:00:00Z', ...extra })
const upNext = (page: Page) => page.getByTestId('up-next')
const u = msg.dashboard.upNext

test.describe('Spec §5 Dashboard: Up next', () => {
  test('Do it crosses off the next task; Something else skips it until tomorrow', async ({ page }) => {
    server.seed('tasks', [task('t1', 'Pay rent', '2026-11-10', { priority: 3 }), task('t2', 'Email Sam', '2026-11-10')])
    await open(page)
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText('Pay rent')
    await upNext(page).getByTestId('up-next-do').click()
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText('Email Sam')
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', status: 'done' })

    await upNext(page).getByTestId('up-next-skip').click()
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText(u.journalTitle) // 9 pm: tonight's journal
    await page.reload()
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText(u.journalTitle)
  })

  test('a task carried over 3 times can move to today, with Undo', async ({ page }) => {
    server.seed('tasks', [task('t1', 'Fix the bike', '2026-11-07')])
    await open(page)
    await expect(upNext(page).getByTestId('up-next-reason')).toHaveText(u.stuck(3))
    await upNext(page).getByTestId('up-next-today').click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', due_date: '2026-11-10' })
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText('Fix the bike') // now a normal task for today
    await page.getByTestId('undo-bar').getByRole('button', { name: msg.undo.undo }).click()
    await expect.poll(() => server.written('tasks').at(-1)?.due_date).toBe('2026-11-07')
  })

  test('with everything skipped, Show skipped brings them back', async ({ page }) => {
    await open(page)
    await upNext(page).getByTestId('up-next-skip').click() // the journal
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText(u.allSkippedTitle)
    await upNext(page).getByTestId('up-next-do').click()
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText(u.journalTitle)
  })

  test('a long title wraps at 320 px without sideways scrolling', async ({ page }) => {
    const link = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query&and=more'
    server.seed('tasks', [task('t1', link, '2026-11-10')])
    await page.setViewportSize({ width: 320, height: 800 })
    await open(page)
    await expect(upNext(page).getByTestId('up-next-title')).toHaveText(link)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
})

test.describe("Spec §5 Dashboard: yesterday's leftovers", () => {
  test('a task due yesterday can be let go (cancelled) or moved to Undated, with Undo', async ({ page }) => {
    server.seed('tasks', [task('t1', 'Email Sam', '2026-11-09'), task('t2', 'Call Mum', '2026-11-09')])
    await open(page)
    const leftovers = page.getByTestId('dash-leftovers')
    await leftovers.getByRole('button', { name: msg.dashboard.leftoverLetGo('Email Sam') }).click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't1', status: 'cancelled' })
    await page.getByTestId('undo-bar').getByRole('button', { name: msg.undo.undo }).click()
    await expect.poll(() => server.written('tasks').at(-1)?.status).toBe('open')
    await leftovers.getByRole('button', { name: msg.dashboard.leftoverUndated('Call Mum') }).click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ id: 't2', due_date: null })
    await expect(page.getByTestId('dash-leftover')).toHaveText([/Email Sam/])
  })
})

