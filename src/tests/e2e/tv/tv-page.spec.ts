import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { pairedTv, tvRoutine, tvSnapshot } from '../support/tv'
import { messages as msg } from '../../../messages'

// SPEC §9 TV app: the page the TV launcher opens, at /tv/. Time-dependent, so on a controlled clock.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-26T03:00:00Z') // 10:00 pm in New York
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
})
const calls = (name: string) => server.rpcArgs.filter((c) => c.name === name)

test.describe('SPEC §9 Signing in by pairing', () => {
  test('an unpaired TV shows a code, checks it until I approve it, then opens the dashboard and stays paired', async ({ page }) => {
    let approved = false
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 's'.repeat(64), expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = () => [approved ? { status: 'paired', device_key: 'new-key' } : { status: 'waiting', device_key: null }]
    server.rpcResults.tv_check = true
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-code')).toHaveText('Q7K M2P')
    await expect(page.getByTestId('tv-qr')).toBeVisible()
    await page.clock.runFor(3_000)
    await expect.poll(() => calls('tv_pair_poll').length).toBeGreaterThan(0)
    expect(calls('tv_pair_poll')[0]!.args).toEqual({ secret: 's'.repeat(64) })
    await expect(page.getByTestId('tv-dashboard')).toBeHidden()

    approved = true
    await page.clock.runFor(3_000)
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    expect(calls('tv_check').at(-1)!.args).toEqual({ device_key: 'new-key' })
  })

  test('a code that runs out is replaced by a new one by itself', async ({ page }) => {
    const codes = ['AAAAAA', 'BBBBBB']
    server.rpcResults.tv_pair_start = () => [{ code: codes.shift(), secret: 'secret', expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = [{ status: 'expired', device_key: null }]
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-code')).toHaveText('AAA AAA')
    await page.clock.runFor(3_000)
    await expect(page.getByTestId('tv-code')).toHaveText('BBB BBB')
  })

  test('an unpaired TV says so and goes back to pairing; Undo on my phone brings it straight back', async ({ page }) => {
    await pairedTv(page)
    server.rpcErrors.tv_check = '28000'
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 'secret', expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = [{ status: 'waiting', device_key: null }]
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-unpaired')).toBeVisible()
    await expect(page.getByTestId('tv-code')).toBeVisible()

    delete server.rpcErrors.tv_check
    server.rpcResults.tv_check = true
    await page.clock.runFor(30_000)
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    expect(calls('tv_check').at(-1)!.args).toEqual({ device_key: 'old-key' })
  })

  test('Unpair on my phone sends a TV showing the dashboard back to pairing at its next refresh', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_snapshot = tvSnapshot()
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 'secret', expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = [{ status: 'waiting', device_key: null }]
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    server.rpcErrors.tv_snapshot = '28000'
    await page.clock.runFor(30_000)
    await expect(page.getByTestId('tv-unpaired')).toBeVisible()
  })
})

test.describe('SPEC §9 Idle screen', () => {
  test('after 15 minutes with no button pressed the TV shows the night clock; the press that wakes it only wakes it', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    await page.clock.runFor(14 * 60_000)
    await page.keyboard.press('ArrowDown')
    await page.clock.runFor(14 * 60_000)
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()

    await page.clock.runFor(60_000)
    await expect(page.getByTestId('tv-idle-clock')).toHaveText('10:29 pm')
    // A listener after the page's own sees whether the waking press got through.
    await page.evaluate(() => window.addEventListener('keydown', () => ((window as unknown as { leaked: boolean }).leaked = true)))
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { leaked?: boolean }).leaked ?? false)).toBe(false)
    await expect(page.getByTestId('tv-idle')).toBeHidden()
  })
})

// Wed Nov 25 2026 in New York: today on the TV.
const TODAY = '2026-11-25'
const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, due_date: TODAY, status: 'open', priority: 1, source: 'manual', deleted_at: null, ...extra })
const event = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: id, user_id: 'me', start_date: TODAY, end_date: TODAY, start_time: '09:00', end_time: '10:00', repeat: 'never', reminder_minutes: null, deleted_at: null, ...extra,
})
const press = async (page: Page, ...keys: string[]) => {
  for (const key of keys) await page.keyboard.press(key)
}

test.describe('SPEC §9 The dashboard: the Monthly calendar and Your Day', () => {
  test.beforeEach(async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
  })

  test('shows this month and today from the snapshot, and the remote moves through months and back', async ({ page }) => {
    server.rpcResults.tv_snapshot = tvSnapshot({ tasks: [task('Buy stamps')], events: [event('Gym')] })
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-month-name')).toHaveText('November 2026')
    await expect(page.getByTestId(`tv-day-${TODAY}`).getByTestId('tv-cell-item')).toHaveText([/Gym/, /Buy stamps/])
    await expect(page.getByTestId('tv-day-row')).toHaveText([/Gym/, /Buy stamps/])
    expect(calls('tv_snapshot')[0]!.args).toMatchObject({ device_key: 'old-key', from_date: '2026-11-01', to_date: '2026-12-05', today: TODAY })

    // Focus starts on ‹; right then OK moves a month on.
    await press(page, 'ArrowRight', 'Enter')
    await expect(page.getByTestId('tv-month-name')).toHaveText('December 2026')
    await expect.poll(() => calls('tv_snapshot').at(-1)!.args).toMatchObject({ from_date: '2026-11-29', to_date: '2027-01-02' })
    await press(page, 'ArrowRight', 'Enter')
    await expect(page.getByTestId('tv-month-name')).toHaveText('November 2026')
    await expect(page.getByTestId('tv-month-this')).toBeHidden()
  })

  test('Your Day turns pages with the remote, so a long day stays inside its box', async ({ page }) => {
    server.rpcResults.tv_snapshot = tvSnapshot({ tasks: Array.from({ length: 9 }, (_, i) => task(`Task ${i + 1}`, { created_at: `2026-11-0${i + 1}T00:00:00Z` })) })
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-day-page')).toHaveText(msg.tv.page(1, 2))
    await page.getByTestId('tv-day-next').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-day-page')).toHaveText(msg.tv.page(2, 2))
    await expect(page.getByTestId('tv-day-row')).toHaveCount(2)
  })

  test('refreshes every 30 seconds, and keeps showing what it had while My Brain is out of reach', async ({ page }) => {
    server.rpcResults.tv_snapshot = tvSnapshot({ tasks: [task('First')] })
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-day-row')).toHaveText([/First/])
    server.rpcResults.tv_snapshot = tvSnapshot({ tasks: [task('First'), task('Added on my phone')] })
    await page.clock.runFor(30_000)
    await expect(page.getByTestId('tv-day-row')).toHaveCount(2)
    server.rpcErrors.tv_snapshot = '500'
    await page.clock.runFor(30_000)
    await expect(page.getByTestId('tv-trouble')).toBeVisible()
    await expect(page.getByTestId('tv-day-row')).toHaveCount(2)
  })
})

test.describe('SPEC §9 Up next on the night screen', () => {
  test('the night screen shows the first suggestion with its line, and the calendar is back on this month when it wakes', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_snapshot = tvSnapshot({ tasks: [task('Buy stamps')] })
    await page.goto('/tv/')
    // As a person waits for the highlight: an arrow pressed before focus is placed only focuses the first button.
    await expect(page.getByTestId('tv-month-prev')).toBeFocused()
    await press(page, 'ArrowRight', 'Enter')
    await expect(page.getByTestId('tv-month-name')).toHaveText('December 2026')

    await page.clock.runFor(15 * 60_000)
    await expect(page.getByTestId('tv-idle-next-title')).toHaveText('Buy stamps')
    await expect(page.getByTestId('tv-idle-next-reason')).toHaveText(msg.dashboard.upNext.task)
    server.rpcResults.tv_snapshot = tvSnapshot({ tasks: [task('Buy stamps', { status: 'done', completed_at: '2026-11-26T03:10:00Z' })], wrote_today: true })
    await page.clock.runFor(30_000)
    await expect(page.getByTestId('tv-idle-next-title')).toHaveText(msg.dashboard.upNext.doneTitle)

    await press(page, 'Enter')
    await expect(page.getByTestId('tv-month-name')).toHaveText('November 2026')
  })

  test('dimmed on the last night of a month, it wakes the next morning on the new month', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-12-01T04:00:00Z')) // Nov 30, 11:00 pm in New York
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_snapshot = tvSnapshot()
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-month-name')).toHaveText('November 2026')
    await page.clock.runFor(15 * 60_000)
    await expect(page.getByTestId('tv-idle')).toBeVisible()
    await page.clock.setSystemTime(new Date('2026-12-01T13:00:00Z')) // Dec 1, 8:00 am
    await page.clock.runFor(1_000)
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-month-name')).toHaveText('December 2026')
  })
})

test.describe('SPEC §9 Routines', () => {
  test('a routine runs full screen from the strip: Completed is saved, the next step shows, and Back returns to the strip', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    const { routine, steps } = tvRoutine('Morning', ['Brush teeth', 'Shower'])
    server.rpcResults.tv_snapshot = tvSnapshot({ routines: [routine], routine_steps: steps })
    // What the server now holds after the press, read back by the TV.
    server.rpcResults.tv_save_routine_step = (args: { runs: unknown[]; step_logs: unknown[] }) => {
      server.rpcResults.tv_snapshot = tvSnapshot({ routines: [routine], routine_steps: steps, routine_runs: args.runs, routine_step_logs: args.step_logs })
      return null
    }
    await page.goto('/tv/')
    await page.getByTestId('tv-routine').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-current-step')).toHaveText('Brush teeth')
    await expect(page.getByTestId('tv-completed')).toBeFocused()

    await press(page, 'Enter')
    await page.clock.runFor(600) // the cross-out
    await expect(page.getByTestId('tv-current-step')).toHaveText('Shower')
    expect(calls('tv_save_routine_step')[0]!.args).toMatchObject({
      device_key: 'old-key',
      runs: [{ routine_id: 'r1', date: TODAY, finished_at: null }],
      step_logs: [{ step_id: 'r1-s1', status: 'completed' }],
      habit_log: null,
    })

    await press(page, 'Escape')
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    await expect(page.getByTestId('tv-routine')).toBeFocused()
    await expect(page.getByTestId('tv-routine')).toContainText(msg.routines.progress(1, 2))
  })

  test("Back from a routine on the strip's second page returns to that page, with focus on it", async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    const all = ['A', 'B', 'C', 'D'].map((t, i) => tvRoutine(t, ['Step'], `r${i + 1}`))
    server.rpcResults.tv_snapshot = tvSnapshot({ routines: all.map((r) => r.routine), routine_steps: all.flatMap((r) => r.steps) })
    await page.goto('/tv/')
    await page.getByTestId('tv-routines-next').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-routines-page')).toHaveText(msg.tv.page(2, 2))
    await page.getByTestId('tv-routine').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-run')).toBeVisible()
    await press(page, 'Escape')
    await expect(page.getByTestId('tv-routines-page')).toHaveText(msg.tv.page(2, 2))
    await expect(page.getByTestId('tv-routine')).toBeFocused()
  })
})

test.describe('SPEC §9 Go on a Quest', () => {
  const hike = { id: 'q1', title: 'Go for a hike', details: '<p>Bring water</p><p><a href="https://example.com/trail">The trail</a></p>', energy_level: 'fun', time_bucket: '2h', status: 'open', times_picked: 0, last_picked_at: null, completed_at: null, deleted_at: null }
  test.beforeEach(async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_snapshot = tvSnapshot()
    server.rpcResults.tv_save_quest = null
    server.rpcResults.tv_save_draw_task = null
  })

  test('the popup picks a quest and saves the pick; Mark done leaves an Undo that puts it back; Back closes it', async ({ page }) => {
    server.rpcResults.tv_quest_draw = { quests: [hike], tasks: [] }
    await page.goto('/tv/')
    await page.getByTestId('tv-quest-open').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-quest-pick')).toBeFocused()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-quest-title')).toHaveText(hike.title)
    await expect(page.getByTestId('tv-quest-result')).toContainText('Bring water')
    await expect(page.getByTestId('tv-quest-accept')).toBeFocused()
    expect(calls('tv_save_quest')[0]!.args).toMatchObject({ device_key: 'old-key', quest_id: 'q1', action: 'pick' })
    // A link in the details can't be reached: opening it would take the TV out of My Brain.
    await press(page, 'ArrowUp')
    await expect(page.getByTestId('tv-quest-result').getByRole('link')).not.toBeFocused()

    await page.getByTestId('tv-quest-done').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-quest-undo')).toBeFocused()
    const done = calls('tv_save_quest')[1]!.args as { log_id: string }
    expect(done).toMatchObject({ quest_id: 'q1', action: 'done', today: TODAY })
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-quest-undo-line')).toHaveCount(0)
    expect(calls('tv_save_quest')[2]!.args).toMatchObject({ quest_id: 'q1', action: 'undo_done', log_id: done.log_id, before_status: 'open' })
    await expect(page.getByTestId('tv-quest-pick')).toBeFocused()

    // Arrows and Tab stay inside the popup.
    const inside = page.getByTestId('tv-quest').locator(':focus')
    await press(page, 'ArrowDown', 'ArrowDown')
    await expect(inside).toHaveCount(1)
    await page.getByTestId('tv-quest-close').focus()
    await press(page, 'Shift+Tab')
    await expect(inside).toHaveCount(1)
    await press(page, 'Escape')
    await expect(page.getByTestId('tv-quest')).toHaveCount(0)
    await expect(page.getByTestId('tv-quest-open')).toBeFocused()
  })

  test('a task can come up in the draw: Do it today dates it, Done crosses it off', async ({ page }) => {
    const stamps = { id: 't1', title: 'Buy stamps', due_date: null, status: 'open', source: 'manual', created_at: '2026-11-20T10:00:00Z', deleted_at: null }
    // The draw has no notes; the picked task is read in full to show them.
    server.rpcResults.tv_quest_draw = { quests: [], tasks: [stamps] }
    server.rpcResults.tv_draw_task = { ...stamps, notes: '<p>The post office closes at 5</p>' }
    await page.goto('/tv/')
    await page.getByTestId('tv-quest-open').focus()
    await press(page, 'Enter', 'Enter')
    await expect(page.getByTestId('tv-quest-title')).toHaveText(stamps.title)
    await expect(page.getByTestId('tv-quest-task')).toContainText('The post office closes at 5')
    expect(calls('tv_draw_task')[0]!.args).toEqual({ device_key: 'old-key', task_id: 't1' })
    await page.getByTestId('tv-quest-today').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-quest-today')).toHaveCount(0)
    await expect(page.getByTestId('tv-quest-task-done')).toBeFocused()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-quest-task')).toHaveCount(0)
    expect(calls('tv_save_draw_task').map((c) => c.args)).toMatchObject([
      { task_id: 't1', action: 'today', today: TODAY },
      { task_id: 't1', action: 'done', today: TODAY },
    ])
    expect(calls('tv_save_quest')).toHaveLength(0)
  })

  test('a press refused because the TV was unpaired sends it back to pairing', async ({ page }) => {
    server.rpcErrors.tv_quest_draw = '28000'
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 'secret', expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = [{ status: 'waiting', device_key: null }]
    await page.goto('/tv/')
    await page.getByTestId('tv-quest-open').focus()
    await press(page, 'Enter', 'Enter')
    await expect(page.getByTestId('tv-unpaired')).toBeVisible()
  })
})

test.describe('SPEC §9 Focus timer', () => {
  test('a minimized timer opens full screen again after 15 minutes instead of the night screen', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_snapshot = tvSnapshot()
    await page.goto('/tv/')
    await page.getByTestId('tv-focus-open').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-focus-pause')).toBeFocused()
    await press(page, 'Escape')
    await expect(page.getByTestId('tv-focus-open')).toBeFocused()
    await page.clock.runFor(15 * 60_000)
    await expect(page.getByTestId('tv-focus')).toBeVisible()
    await expect(page.getByTestId('tv-focus-pause')).toBeFocused()
    await expect(page.getByTestId('tv-idle')).toHaveCount(0)
  })

  test('a TV found unpaired when it starts stops a timer saved from before', async ({ page }) => {
    await pairedTv(page)
    await page.addInitScript(() => localStorage.setItem('my-brain:tv-focus', JSON.stringify({ state: { phase: 'work', round: 1, endsAt: Date.now() + 60_000, pausedMs: null }, minimized: true })))
    server.rpcErrors.tv_check = '28000'
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 'secret', expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = [{ status: 'waiting', device_key: null }]
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-unpaired')).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('my-brain:tv-focus'))).toBeNull()
  })

  test('opens full screen from the strip and joins the room with the TV key; a finished work part is kept; Back minimizes it to the strip', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_snapshot = tvSnapshot()
    server.rpcResults.tv_focus_room = { dots: [{ id: 'abc12345', s: 600 }], together: true }
    await page.goto('/tv/')
    // Time only moves when the test moves it, so the time left is known exactly.
    await page.clock.pauseAt(new Date(NOW.getTime() + 10_000))
    await page.getByTestId('tv-focus-open').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-focus-pause')).toBeFocused()
    await expect(page.getByTestId('tv-focus-time')).toHaveText('25:00')
    await expect(page.getByTestId('tv-focus-dot')).toHaveCount(1)
    expect(calls('tv_focus_room')[0]!.args).toMatchObject({ device_key: 'old-key', p_phase: 'work' })

    // A whole work part with the timer showing: the night screen stays off, and the session is kept for trophies.
    await page.clock.runFor(25 * 60_000 + 1_000)
    await expect(page.getByTestId('tv-focus-phase')).toHaveText(msg.focus.phase.short)
    await expect.poll(() => calls('tv_log_focus').length).toBe(1)
    expect(calls('tv_log_focus')[0]!.args).toMatchObject({ device_key: 'old-key', together: true })

    await press(page, 'Escape')
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    await expect(page.getByTestId('tv-focus-open')).toBeFocused()
    await expect(page.getByTestId('tv-focus-open')).toHaveAccessibleName(msg.focus.openPill(msg.focus.phaseShort.short, '04:59'))
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-focus-phase')).toHaveText(msg.focus.phase.short)
    await page.getByTestId('tv-focus-close').focus()
    await press(page, 'Enter')
    await expect(page.getByTestId('tv-focus-open')).toHaveText(msg.focus.heading)
    await expect.poll(() => calls('tv_focus_leave').length).toBe(1)
  })
})
