import { expect, test } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// SPEC §9 Signing in by pairing: approving my TV's code on my phone, and Paired devices on the Account page.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-26T15:00:00Z')
const TV = { id: 'dddddddd-0000-4000-8000-000000000001', name: 'TV', created_at: '2026-11-20T15:00:00Z', last_seen_at: '2026-11-26T14:00:00Z' }
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
})
const calls = (name: string) => server.rpcArgs.filter((c) => c.name === name)

test('SPEC §9: a wrong code is refused on its box; the right one pairs the TV and it shows in the list', async ({ page }) => {
  let devices: (typeof TV)[] = []
  server.rpcResults.my_paired_devices = () => devices
  server.rpcResults.pair_tv = ({ code }: Record<string, unknown>) => {
    if (code !== 'Q7KM2P') return false
    devices = [TV]
    return true
  }
  await page.goto('/account')
  const section = page.getByTestId('paired-devices')
  const box = section.getByTestId('pair-code')
  await box.fill('zzzzzz')
  await section.getByRole('button', { name: msg.pairedDevices.pair }).click()
  await expect(section.getByTestId('pair-error')).toHaveText(msg.pairedDevices.badCode)
  await expect(box).toBeFocused()

  await box.fill('q7k m2p')
  await section.getByRole('button', { name: msg.pairedDevices.pair }).click()
  await expect(section.getByTestId('pair-done')).toHaveText(msg.pairedDevices.paired)
  await expect(section.getByTestId('pair-error')).toBeHidden()
  await expect(section.getByTestId('paired-device')).toHaveCount(1)
})

test('SPEC §9 and §2: Unpair works straight away with Undo in place, and Undo puts the same TV back', async ({ page }) => {
  let devices = [TV]
  server.rpcResults.my_paired_devices = () => devices
  server.rpcResults.unpair_device = ({ undo }: Record<string, unknown>) => {
    devices = undo ? [TV] : []
    return null
  }
  await page.goto('/account')
  const section = page.getByTestId('paired-devices')
  await section.getByRole('button', { name: msg.pairedDevices.unpairLabel('TV', 'Fri, Nov 20') }).click()
  await expect(section.getByTestId('paired-device')).toHaveCount(0)
  const undo = section.getByRole('button', { name: msg.undo.undo })
  await expect(undo).toBeFocused()
  await undo.click()
  await expect(section.getByTestId('paired-device')).toHaveCount(1)
  expect(calls('unpair_device').map((c) => c.args)).toEqual([{ device: TV.id, undo: false }, { device: TV.id, undo: true }])
})

test('SPEC §9: the QR code opens /pair with the code filled in, so pairing is one tap', async ({ page }) => {
  server.rpcResults.pair_tv = true
  await page.goto('/pair?code=q7km2p')
  await expect(page.getByTestId('pair-code')).toHaveValue('Q7KM2P')
  await page.getByRole('button', { name: msg.pairedDevices.pair }).click()
  await expect(page.getByTestId('pair-done')).toHaveText(msg.pairedDevices.paired)
  expect(calls('pair_tv')[0]!.args).toEqual({ code: 'Q7KM2P' })
})
