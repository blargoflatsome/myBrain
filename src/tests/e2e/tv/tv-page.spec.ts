import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { pairedTv, tvSnapshot } from '../support/tv'
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
