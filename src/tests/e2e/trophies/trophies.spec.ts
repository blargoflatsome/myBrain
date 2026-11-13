import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { FakeSupabase, TEST_USER_ID } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages, messages as msg } from '../../../messages'

const t = messages.celebrations.trophies

// SPEC §5 Trophies on the Dashboard: newest levels, everything by category with progress, locked ones in a window,
// the first time on a device, and new levels as they're earned. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
let server: FakeSupabase

const H1 = 'aaaaaaa1-0000-4000-8000-000000000001'
const habit = (id: string) => ({ id, title: 'Walk', notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', current_streak: 0, best_streak: 0 })
const log = (habitId: string, date: string) => ({ id: `${habitId.slice(0, 24)}${date.replaceAll('-', '')}0000`, habit_id: habitId, date, status: 'completed', completed_at: `${date}T15:00:00Z` })
const BADGE_NUMBER = { first_task: 1, first_habit: 2, first_routine: 3, first_journal: 4 } as const
const badge = (kind: keyof typeof BADGE_NUMBER, earned_at: string) => ({ id: `${TEST_USER_ID.slice(0, 24)}${String(BADGE_NUMBER[kind]).padStart(12, '0')}`, kind, earned_at })
const doneTasks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `Done ${i}`, due_date: '2026-11-09', status: 'done', completed_at: '2026-11-09T15:00:00Z', source: 'manual', priority: 1, created_at: '2026-11-01T00:00:00Z' }))

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})
async function open(page: Page, path = '/') {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.describe('SPEC §5 Trophies on the Dashboard', () => {
  test('my 3 newest levels show with the day earned', async ({ page }) => {
    server.seed('badges', [
      badge('first_task', '2026-11-02T15:00:00Z'),
      badge('first_habit', '2026-11-03T15:00:00Z'),
      badge('first_routine', '2026-11-04T15:00:00Z'),
      badge('first_journal', '2026-11-05T15:00:00Z'),
    ])
    await open(page)
    const trophies = page.getByTestId('dash-trophies')
    const shown = trophies.locator('#dash-trophy-list [data-testid^="trophy-"][data-level]')
    await expect(shown).toHaveCount(3)
    await expect(shown.first()).toHaveAttribute('data-testid', 'trophy-first_journal')
    await expect(shown.first()).toContainText(t.earnedOn('Nov 5, 2026'))
    await expect(trophies.getByTestId('dash-trophy-count')).toHaveText('4 trophies')
  })

  test('See all trophies groups what I have earned or started by category, with progress', async ({ page }) => {
    server.seed('habits', [habit(H1)])
    server.seed('habit_logs', [log(H1, '2026-11-08'), log(H1, '2026-11-09')])
    server.seed('badges', [badge('first_task', '2026-11-05T15:00:00Z')])
    await open(page)
    const trophies = page.getByTestId('dash-trophies')
    await expect(trophies.getByTestId('dash-perfect-days')).toHaveCount(0) // perfect days are a trophy, not a number here
    const more = trophies.getByTestId('dash-trophies-more')
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(trophies.getByTestId('trophy-category-firsts').getByRole('heading', { name: msg.celebrations.trophies.categories.firsts })).toBeVisible()
    const perfect = trophies.getByTestId('trophy-category-perfect').getByTestId('trophy-perfect_days')
    await expect(perfect.getByTestId('trophy-level')).toHaveText(msg.celebrations.trophies.tiers.bronze)
    await expect(perfect.getByTestId('trophy-progress')).toHaveText('2 of 10 days')
    const streak = trophies.getByTestId('trophy-category-streaks').getByTestId('trophy-habit_streak')
    await expect(streak.getByTestId('trophy-progress')).toHaveText('2 of 3 days')
    await expect(trophies.getByTestId('trophy-groups').getByTestId('trophy-first_quest')).toHaveCount(0) // not started: in the locked window
    await expect(more).toHaveText(msg.celebrations.trophies.seeFewer)
  })

  test('See locked trophies opens a window by category; surprises show as ???', async ({ page }) => {
    await open(page)
    const trophies = page.getByTestId('dash-trophies')
    await expect(trophies).toContainText(t.none)
    await trophies.getByTestId('dash-trophies-locked').click()
    const locked = page.getByRole('dialog', { name: msg.celebrations.trophies.lockedHeading })
    await expect(locked.getByRole('heading', { name: msg.celebrations.trophies.categories.streaks })).toBeVisible()
    await expect(locked.getByTestId('trophy-that_was_fast').getByTestId('trophy-name')).toHaveText(msg.celebrations.trophies.hidden)
    await expect(locked.getByTestId('trophy-habit_streak')).toContainText(msg.celebrations.trophies.about.habit_streak)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await locked.getByText(msg.celebrations.trophies.close, { exact: true }).click()
    await expect(locked).toBeHidden()
  })
})

test.describe('SPEC §5 Trophies: what I did to earn one', () => {
  test('tapping an earned trophy opens what I did and each level reached; a locked one does nothing', async ({ page }) => {
    server.seed('habits', [habit(H1)])
    server.seed('habit_logs', ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((d) => log(H1, d)))
    await open(page)
    const trophies = page.getByTestId('dash-trophies')
    await trophies.getByTestId('dash-trophies-more').click()
    await trophies.getByTestId('trophy-groups').getByTestId('trophy-habit_streak').getByRole('button').click()
    const details = page.getByTestId('trophy-details')
    await expect(details).toBeVisible()
    await expect(details.getByTestId('trophy-details-about')).toHaveText(t.earnedAbout.habit_streak!)
    const levels = details.getByTestId('trophy-details-levels').getByRole('listitem')
    await expect(levels).toHaveCount(6)
    await expect(levels.first()).toContainText(t.tiers.bronze!)
    await details.getByText(t.close, { exact: true }).click()
    await expect(details).toBeHidden()

    await trophies.getByTestId('dash-trophies-locked').click()
    await expect(page.getByTestId('locked-trophies').getByTestId('trophy-journal_streak').getByRole('button')).toHaveCount(0)
  })
})

test.describe('SPEC §5 Trophies: earning them', () => {
  test('the first time on a device, trophies from the past arrive as one alert, not a burst each', async ({ page }) => {
    // Undo the test setup's "already worked out on this device" (scripts run in order, so this one wins).
    await page.addInitScript((uid) => localStorage.removeItem(`my-brain:trophies-ready:${uid}`), TEST_USER_ID)
    server.seed('tasks', doneTasks(10))
    await open(page)
    await expect.poll(() => server.written('notifications').map((n) => n.kind)).toEqual(['trophies'])
    await expect.poll(() => server.written('badges').find((b) => b.kind === 'tasks_completed')?.levels).toHaveLength(1)
    await expect(page.getByText(/New trophy:/)).toHaveCount(0)
  })

  test('a new level is saved as I earn it', async ({ page }) => {
    server.seed('tasks', [...doneTasks(9), { id: 'cccccccc-0000-4000-8000-000000000001', title: 'Tenth', due_date: '2026-11-10', status: 'open', source: 'manual', priority: 1, created_at: '2026-11-01T00:00:00Z' }])
    await open(page, '/tasks')
    await page.getByRole('button', { name: 'Cross off Tenth' }).click()
    await expect.poll(() => server.written('badges').find((b) => b.kind === 'tasks_completed')?.levels).toHaveLength(1)
  })
})

test.describe('SPEC §5 Dashboard: close to a trophy', () => {
  test('the trophy nearest its next level shows at the top of Trophies and opens it', async ({ page }) => {
    server.seed('tasks', doneTasks(8)) // 8 of 10 tasks made and completed; ties go to the first in the list
    await open(page)
    const line = page.getByTestId('dash-trophy-close')
    await expect(line).toHaveText(t.closeTo(2, 'count', `${t.names.tasks_created} ${t.tiers.bronze}`))
    await line.click()
    await expect(page.getByTestId('trophy-details')).toBeVisible()
  })
})
