import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase, TEST_USER_ID } from './support/fakeSupabase'
import { isSafari } from './support/devices'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')

let server: FakeSupabase

function task(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, due_date: '2026-11-10', status: 'open', source: 'manual', priority: 1, created_at: '2026-11-01T00:00:00Z', ...extra }
}
function habit(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0, ...extra }
}
function log(habitId: string, date: string) {
  return { id: `${habitId.slice(0, 24)}${date.replaceAll('-', '')}0000`, habit_id: habitId, date, status: 'completed', completed_at: `${date}T15:00:00Z` }
}
// Log ids are built from the first 24 characters of a habit's id, so test ids differ there.
const H1 = 'aaaaaaa1-0000-4000-8000-000000000001'
const H2 = 'aaaaaaa2-0000-4000-8000-000000000002'

async function open(page: Page, path: string, time = NOW) {
  await page.clock.install({ time })
  await page.goto(path)
}
const message = (page: Page) => page.getByTestId('celebration-message')
// A badge as the app stores it: the same id on every device (SPEC §5 Celebrations).
const BADGE_NUMBER = { first_task: 1, first_habit: 2 } as const
const badge = (kind: keyof typeof BADGE_NUMBER, earned_at = '2026-11-05T15:00:00Z') => ({ id: `${TEST_USER_ID.slice(0, 24)}${String(BADGE_NUMBER[kind]).padStart(12, '0')}`, kind, earned_at })

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Celebrations: small, every time', () => {
  test('crossing off a task: the check draws in, confetti comes out, and my first one earns a badge', async ({ page }) => {
    server.seed('tasks', [task('a', 'water plants'), task('bb', 'pay rent')])
    await open(page, '/tasks')
    await page.getByRole('button', { name: 'Cross off water plants' }).click()
    await expect(page.getByTestId('task-check').first()).toHaveClass(/celebrate-draw/)
    await expect(page.getByTestId('confetti').first()).toHaveAttribute('data-size', 'small')
    await expect(message(page)).toHaveText('New badge: First task crossed off')
    await expect.poll(() => server.written('badges').map((b) => b.kind)).toEqual(['first_task'])
  })

  test('the last task of the day gives a bigger burst and the list-cleared message', async ({ page }) => {
    server.seed('tasks', [task('a', 'water plants', { status: 'done', completed_at: '2026-11-10T13:00:00Z' }), task('bb', 'pay rent')])
    server.seed('badges', [badge('first_task', '2026-11-09T12:00:00Z')])
    await open(page, '/tasks')
    await page.getByRole('button', { name: 'Cross off pay rent' }).click()
    await expect(page.locator('[data-testid="confetti"][data-size="big"]')).toHaveCount(1)
    await expect(page.getByText('Everything past you asked for today is done!.')).toBeVisible()
  })

  test('completing a habit fills its ring and bumps its streak; the last one of the day is the biggest moment', async ({ page }) => {
    server.seed('habits', [habit(H1, 'Walk', { start_date: '2026-11-10' }), habit(H2, 'Read', { start_date: '2026-11-10' })])
    server.seed('badges', [badge('first_habit', '2026-11-09T12:00:00Z')])
    await open(page, '/habits')
    await page.getByRole('button', { name: 'Mark Walk done' }).click()
    await expect(page.getByRole('button', { name: 'Undo Walk' })).toBeVisible()
    await expect(page.getByTestId('habit-ring')).toHaveCount(1)
    await expect(page.getByRole('listitem').filter({ hasText: 'Walk' }).getByTestId('habit-streak')).toHaveClass(/celebrate-bounce/)
    await page.getByRole('button', { name: 'Mark Read done' }).click()
    await expect(page.locator('[data-testid="confetti"][data-size="biggest"]')).toHaveCount(1)
    await expect(message(page)).toHaveText('Every habit done today. Past you would be proud.')
  })

  test('coming back to a habit after missing 2 days says welcome back, not anything about the lost streak', async ({ page }) => {
    server.seed('habits', [habit(H1, 'Walk'), habit(H2, 'Read')])
    server.seed('habit_logs', [log(H1, '2026-11-07')])
    server.seed('badges', [badge('first_habit', '2026-11-07T12:00:00Z')])
    await open(page, '/habits')
    await page.getByRole('button', { name: 'Mark Walk done' }).click()
    await expect(message(page)).toHaveText('Welcome back. Picking it up again is what counts.')
  })

  test('saving a capture makes the Capture button pulse once its window closes', async ({ page }) => {
    await open(page, '/tasks')
    await page.getByTestId('capture-button').click()
    await page.getByRole('button', { name: 'Decide later' }).click()
    await page.getByLabel("What's on your mind?").fill('maybe learn Portuguese')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('capture-notice')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('capture-button')).toHaveAttribute('data-pulsing', 'true')
  })

  test('saving the journal glows around the writing, and my first entry earns a badge', async ({ page }) => {
    await open(page, '/journal')
    const editor = page.getByRole('textbox', { name: 'How the day went' })
    await editor.click()
    await page.keyboard.type('A good day.')
    await page.getByRole('heading', { name: 'Journal', level: 1 }).click()
    await expect(page.getByTestId('journal-writing')).toHaveAttribute('data-glowing', 'true')
    await expect(message(page)).toHaveText('New badge: First journal entry')
  })
})

test.describe('Spec §5 Celebrations: finishing a set', () => {
  test('a routine finished: a progress bar moves along, then the steps fold into one ticked badge', async ({ page }) => {
    const RID = 'bbbbbbbb-0000-4000-8000-000000000001'
    server.seed('routines', [{ id: RID, title: 'Morning', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-10' }])
    server.seed('routine_steps', ['Wake up', 'Stretch'].map((title, i) => ({ id: `ccccccc${i}-0000-4000-8000-000000000000`, routine_id: RID, position: i, title, start_date: '2026-11-10' })))
    await open(page, `/routines/${RID}/run`)
    await expect(page.getByTestId('routine-progress')).toHaveAttribute('style', /width: 0%/)
    await page.getByRole('button', { name: 'Completed' }).click()
    await page.clock.runFor(700)
    await expect(page.getByTestId('routine-progress')).toHaveAttribute('style', /width: 50%/)
    await page.getByRole('button', { name: 'Completed' }).click()
    await page.clock.runFor(700)
    await expect(page.getByTestId('routine-finished')).toHaveText('Routine complete. Past you would be proud.')
    await expect(message(page)).toHaveText('New badge: First routine finished')
  })

  test('sorting the last orphan shows a friendly all-sorted', async ({ page }) => {
    server.seed('inbox', [{ id: 'i1', body: 'maybe learn Portuguese' }])
    await open(page, '/orphans')
    await page.getByRole('button', { name: 'Quest' }).click()
    await expect(page.getByTestId('orphans-sorted')).toHaveText('All sorted. Every orphan has a home.')
    await expect(message(page)).toHaveText('New badge: First orphan sorted')
  })

  test('a finished work part in the Focus timer shows today’s focus time', async ({ page }) => {
    test.skip(isSafari(test.info()), 'fast-forwarding many minutes takes over a minute on WebKit; the same logic runs on Chrome')
    await open(page, '/')
    await page.getByRole('button', { name: 'Focus timer' }).first().click()
    const timer = page.getByTestId('focus-timer')
    await page.clock.runFor(25 * 60_000 + 1000)
    await expect(timer.getByTestId('focus-phase')).toHaveText('Short break')
    await expect(timer.getByTestId('focus-today')).toHaveText('Focus time today: 25 min')
  })
})

test.describe('Spec §5 Celebrations: all habits done, the next day', () => {
  test('the first time I open the app after a perfect day, a congratulations alert is waiting', async ({ page }) => {
    server.seed('habits', [habit(H1, 'Walk')])
    server.seed('habit_logs', [log(H1, '2026-11-09')])
    await open(page, '/')
    await expect(page.getByTestId('alert-banner')).toContainText('Yesterday was a perfect day')
    await expect.poll(() => server.written('notifications').map((n) => n.kind)).toEqual(['perfect_day'])
    // Earlier history earns its badge quietly: no celebration for it.
    await expect.poll(() => server.written('badges').map((b) => b.kind)).toEqual(['first_habit'])
    await expect(message(page)).toHaveCount(0)
  })
})

test.describe('Spec §5 Dashboard: Trophies', () => {
  test('badges earned show with their day; the rest are listed as not yet; perfect days are counted', async ({ page }) => {
    server.seed('habits', [habit(H1, 'Walk')])
    server.seed('habit_logs', [log(H1, '2026-11-08'), log(H1, '2026-11-09')])
    server.seed('badges', [badge('first_task', '2026-11-05T15:00:00Z')])
    await open(page, '/')
    const trophies = page.getByTestId('dash-trophies')
    await expect(trophies).toContainText('of 10 badges')
    await expect(trophies.getByTestId('badge-first_task')).toContainText('Earned Nov 5, 2026')
    await expect(trophies.getByTestId('badge-first_quest')).toContainText('Not yet')
    await expect(trophies.getByTestId('dash-perfect-days')).toHaveText('2 perfect days')
  })
})

test.describe('Spec §5 Celebrations: the setting', () => {
  test('Celebrations on the Account page saves Full, Gentle or Off to my profile', async ({ page }) => {
    await open(page, '/account')
    const setting = page.getByTestId('celebrations-setting')
    await expect(setting).toHaveValue('full')
    await setting.selectOption('off')
    await page.getByTestId('profile-settings').getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.profile.celebrations).toBe('off')
  })

  test('Off: no confetti, but the message and badge still come', async ({ page }) => {
    server.setProfile({ celebrations: 'off' })
    server.seed('tasks', [task('a', 'water plants'), task('bb', 'pay rent')])
    await open(page, '/tasks')
    await page.getByRole('button', { name: 'Cross off water plants' }).click()
    await expect(message(page)).toHaveText('New badge: First task crossed off')
    await expect(page.getByTestId('confetti')).toHaveCount(0)
  })

  test('reduce motion on the device makes Full act as Gentle: no confetti', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    server.seed('tasks', [task('a', 'water plants'), task('bb', 'pay rent')])
    await open(page, '/tasks')
    await page.getByRole('button', { name: 'Cross off water plants' }).click()
    await expect(message(page)).toHaveText('New badge: First task crossed off')
    await expect(page.getByTestId('confetti')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-celebrate', 'gentle')
  })

  test('confetti is hidden from screen readers and never catches a tap; the message is a polite live region', async ({ page }) => {
    await open(page, '/tasks')
    await expect(page.getByTestId('confetti-layer')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByTestId('confetti-layer')).toHaveCSS('pointer-events', 'none')
    await expect(page.getByTestId('celebration')).toHaveAttribute('aria-live', 'polite')
    await expect(page.getByTestId('celebration')).toHaveCSS('pointer-events', 'none')
  })
})
