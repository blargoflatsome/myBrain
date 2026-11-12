import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-11T01:00:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Journal: tomorrow and better than yesterday', () => {
  test('"How to make tomorrow better?" is its own box, saved to the day', async ({ page }) => {
    await open(page, '/journal')
    const box = page.getByRole('textbox', { name: msg.journal.tomorrowLabel })
    await box.click()
    await page.getByRole('toolbar', { name: 'Formatting: How to make tomorrow better?' }).getByRole('button', { name: msg.editor.bold }).click()
    await page.keyboard.type('Lay out clothes tonight')
    await page.getByRole('heading', { name: msg.nav.journal, level: 1 }).click()
    await expect
      .poll(() => server.written('journal_entries').find((e) => e.date === '2026-11-10' && e.tomorrow))
      .toMatchObject({ tomorrow: '<p><strong>Lay out clothes tonight</strong></p>' })
  })

  test('the better-than-yesterday question comes before the writing, and tomorrow comes after it', async ({ page }) => {
    await open(page, '/journal')
    const today = page.getByTestId('journal-today')
    const top = async (loc: ReturnType<Page['getByRole']>) => (await loc.boundingBox())!.y
    const better = await top(today.getByRole('radiogroup', { name: msg.journal.betterLabel }))
    const writing = await top(today.getByRole('textbox', { name: msg.journal.writeLabel }))
    const tomorrow = await top(today.getByRole('textbox', { name: msg.journal.tomorrowLabel }))
    expect(better).toBeLessThan(writing)
    expect(writing).toBeLessThan(tomorrow)
  })

  test('Earlier entries show formatted tomorrow answers, and no tags', async ({ page }) => {
    server.seed('journal_entries', [
      { id: 'j-9', date: '2026-11-09', body: '<p>Fine day</p>', tomorrow: '<p><strong>Sleep early</strong></p>', better_than_yesterday: true, stats: {}, auto: false, stats_final: true },
    ])
    await open(page, '/journal')
    const entry = page.getByTestId('journal-entry-2026-11-09')
    await expect(entry.getByTestId('journal-tomorrow').locator('strong')).toHaveText('Sleep early')
    await expect(page.getByRole('combobox', { name: msg.tags.add })).toHaveCount(0)
  })

  test('"Was today better than yesterday?" is answered Yes or No, and tapping again clears it', async ({ page }) => {
    await open(page, '/journal')
    const group = page.getByRole('radiogroup', { name: msg.journal.betterLabel })
    await group.getByRole('radio', { name: msg.guest.yes }).click()
    await expect(group.getByRole('radio', { name: msg.guest.yes })).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => lastWrite('journal_entries')).toMatchObject({ date: '2026-11-10', better_than_yesterday: true })
    await group.getByRole('radio', { name: msg.guest.no }).click()
    await expect.poll(() => lastWrite('journal_entries')).toMatchObject({ better_than_yesterday: false })
    // Wait for the first tap to show before tapping again (a slow phone can otherwise take both as one).
    await expect(group.getByRole('radio', { name: msg.guest.no })).toHaveAttribute('aria-checked', 'true')
    await group.getByRole('radio', { name: msg.guest.no }).click()
    await expect.poll(() => lastWrite('journal_entries')).toMatchObject({ better_than_yesterday: null })
  })
})

