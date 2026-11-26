import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'

// SPEC §9 TV app: the page the TV launcher opens, at /tv/. Time-dependent, so on a controlled clock.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-26T03:00:00Z') // 10:00 pm in New York
const KEY_STORE = 'my-brain:tv-device-key'
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
})
const calls = (name: string) => server.rpcArgs.filter((c) => c.name === name)
const pairedTv = (page: Page) => page.addInitScript((k) => localStorage.setItem(k, 'old-key'), KEY_STORE)

test.describe('SPEC §9 Signing in by pairing', () => {
  test('an unpaired TV shows a code, checks it until I approve it, then opens the dashboard and stays paired', async ({ page }) => {
    let approved = false
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 's'.repeat(64), expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = () => [approved ? { status: 'paired', device_key: 'new-key' } : { status: 'waiting', device_key: null }]
    server.rpcResults.tv_check = true
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-code')).toHaveText('Q7K M2P')
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

  test('Unpair on my phone sends a TV showing the dashboard back to pairing', async ({ page }) => {
    await pairedTv(page)
    server.rpcResults.tv_check = true
    server.rpcResults.tv_pair_start = [{ code: 'Q7KM2P', secret: 'secret', expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() }]
    server.rpcResults.tv_pair_poll = [{ status: 'waiting', device_key: null }]
    await page.goto('/tv/')
    await expect(page.getByTestId('tv-dashboard')).toBeVisible()
    server.rpcErrors.tv_check = '28000'
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
