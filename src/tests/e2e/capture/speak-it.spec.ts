import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-20T15:00:00Z') // Friday morning in New York

let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  // A stand-in for the browser's speech recognition: it "hears" whatever window.nextHeard holds.
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: unknown) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start() {
        const transcript = (window as unknown as { nextHeard: string }).nextHeard
        // A microtask, not a timer: the test's mocked clock holds timers.
        queueMicrotask(() => {
          this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] })
          this.onend?.()
        })
      }
      stop() {}
    }
    // Both names: newer Chromium has its own unprefixed one, which the app prefers.
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition })
  })
  await page.clock.install({ time: NOW })
})

async function say(page: Page, words: string) {
  await page.evaluate((w) => ((window as unknown as { nextHeard: string }).nextHeard = w), words)
  await page.getByRole('button', { name: msg.capture.micStart }).click()
}

const typeChip = (page: Page, type: string) => page.getByRole('group', { name: msg.capture.whereHeading }).getByRole('button', { name: type, exact: true })
const titleBox = (page: Page) => page.getByLabel(msg.capture.titleLabel, { exact: true })

test.describe('SPEC §5 Quick capture: Speak it fills the form', () => {
  test('what I say picks the type and fills the title and date, and nothing saves until I tap Save', async ({ page }) => {
    await page.goto('/capture')
    await say(page, 'add dentist appointment December 13th to tasks')

    await expect(typeChip(page, msg.capture.destinations.task)).toHaveAttribute('aria-pressed', 'true')
    await expect(titleBox(page)).toHaveValue('Dentist appointment')
    // What was filled is said in a status line, so screen readers hear it.
    await expect(page.getByRole('status').filter({ hasText: 'Dentist appointment' })).toBeVisible()
    expect(server.written('tasks')).toHaveLength(0)

    await page.getByTestId('capture-save').click()
    await expect.poll(() => server.written('tasks').at(-1)).toMatchObject({ title: 'Dentist appointment', due_date: '2026-12-13' })
  })

  test('speaking again replaces the form, and Undo puts back what was there', async ({ page }) => {
    await page.goto('/capture')
    // "my shopping list" names a bucket, so wait until the buckets are on this device (seen under The Vault).
    await typeChip(page, msg.capture.destinations.vault).click()
    await expect(page.getByText('Shopping list', { exact: true })).toBeVisible()
    await say(page, 'add learn the ukulele as a quest')
    await expect(titleBox(page)).toHaveValue('Learn the ukulele')

    await say(page, 'add milk to my shopping list')
    await expect(typeChip(page, msg.capture.destinations.vault)).toHaveAttribute('aria-pressed', 'true')
    await expect(titleBox(page)).toHaveValue('Milk')

    await page.getByTestId('capture-heard-undo').click()
    await expect(typeChip(page, msg.capture.destinations.quest)).toHaveAttribute('aria-pressed', 'true')
    await expect(titleBox(page)).toHaveValue('Learn the ukulele')
  })

  test('words that aren\'t a command just go in the text box, with the chosen type kept', async ({ page }) => {
    await page.goto('/capture')
    await typeChip(page, msg.capture.destinations.quest).click()
    await say(page, 'paint the fence')
    await expect(typeChip(page, msg.capture.destinations.quest)).toHaveAttribute('aria-pressed', 'true')
    await expect(titleBox(page)).toHaveValue('paint the fence')
  })
})
