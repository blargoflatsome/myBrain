import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Random Quest: calmer page, sorted by effort, in pages', () => {
  test('the list is easiest first, 10 per page, with page controls', async ({ page }) => {
    const levels = ['medicated', 'needs_setup', 'fun', 'ugh']
    server.seed(
      'quests',
      Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, title: `Quest ${String(i).padStart(2, '0')}`, energy_level: levels[i % 4], time_bucket: '30m', status: 'open' })),
    )
    await open(page, '/quests')
    const titles = page.getByTestId('quest-list').getByTestId('quest-title')
    await expect(titles).toHaveCount(10)
    await expect(titles.first()).toHaveText('Quest 03')
    await expect(page.getByTestId('page-position')).toHaveText(msg.pages.position(1, 2))
    await page.getByRole('navigation', { name: msg.quests.allHeading }).getByRole('button', { name: /Next/ }).click()
    await expect(titles).toHaveCount(2)
    await expect(titles).toHaveText(['Quest 04', 'Quest 08'])
    // The chosen filter is a soft tint with a check mark, not a solid green button.
    const any = page.getByRole('group', { name: /energy/i }).getByRole('button').first()
    await expect(any).toHaveAttribute('aria-pressed', 'true')
    // The check mark is drawn by .choice-on (SPEC §2 Calm by design: the same for every choice).
    expect(await any.evaluate((el) => getComputedStyle(el, '::before').content)).toContain('✓')
    await expect(any).not.toHaveClass(/(^| )bg-accent( |$)/)
  })
})

test.describe('Spec §5 Random Quest: rows on a phone', () => {
  test('the title gets the full width with its chips under it, and a long link wraps without sideways scrolling', async ({ page }) => {
    const link = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query&and=more'
    server.seed('quests', [
      { id: 'q1', title: '3dPrint', energy_level: 'fun', time_bucket: '30m', status: 'open' },
      { id: 'q2', title: link, energy_level: 'fun', time_bucket: '2h', status: 'open' },
    ])
    await page.setViewportSize({ width: 320, height: 900 })
    await open(page, '/quests')
    const row = page.getByTestId('quest-row').filter({ hasText: '3dPrint' })
    const title = (await row.getByTestId('quest-title').boundingBox())!
    const chip = (await row.getByText(msg.quests.energy.fun).boundingBox())!
    // The chips sit under the title, never beside it squeezing it (SPEC §5 Random Quest).
    expect(chip.y).toBeGreaterThanOrEqual(title.y + title.height - 1)
    await expect(page.getByTestId('quest-title').filter({ hasText: link })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
})

