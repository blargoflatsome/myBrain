import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §8 Security: what people type can never run as code, links can't be scripts, and every page is served with
// strict security headers that don't break anything. New York, Tue Nov 10 2026, 8:00 pm.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T01:00:00Z')
let server: FakeSupabase

// Each attack sets window.__hacked if it ever runs.
const ATTACKS = [
  '<img src=x onerror="window.__hacked=1">',
  '<script>window.__hacked=1</script>',
  '<svg onload="window.__hacked=1"></svg>',
  '"><iframe src="javascript:window.parent.__hacked=1"></iframe>',
  '{{ constructor.constructor("window.__hacked=1")() }}',
]
const ATTACK = ATTACKS.join(' ')

async function notHacked(page: Page) {
  // Waiting for something that must NOT happen: give any injected script a moment to run.
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as unknown as { __hacked?: number }).__hacked)).toBeUndefined()
}

function watchCsp(page: Page) {
  const violations: string[] = []
  page.on('console', (entry) => {
    if (entry.type() === 'error' && /Content Security Policy/i.test(entry.text())) violations.push(entry.text())
  })
  return violations
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
  await page.clock.install({ time: NOW })
})

test.describe('Spec §8 Security headers', () => {
  test('every page is served with a strict Content Security Policy and protective headers', async ({ page }) => {
    const response = await page.goto('/')
    const h = response!.headers()
    expect(h['content-security-policy']).toContain("script-src 'self'")
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('nothing the app needs is blocked by the policy, on any page', async ({ page }) => {
    // Visits every page; Safari's engine is slower at it.
    test.slow()
    const violations = watchCsp(page)
    server.seed('events', [{ id: 'e1', title: 'Dentist', notes: null, start_date: '2026-11-10', start_time: '15:00:00', end_date: '2026-11-10', end_time: '16:00:00', repeat: 'never', reminder_minutes: null }])
    server.seed('post_its', [{ id: 'p1', body: '<p>Note</p>', color: 'yellow', position: 0 }])
    for (const path of ['/', '/tasks', '/habits', '/routines', '/journal', '/vault', '/calendar', '/quests', '/orphans', '/account', '/capture', '/privacy']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }
    expect(violations).toEqual([])
  })
})

test.describe('Spec §8 Typed text never runs as code', () => {
  test('in tasks, habits, quests, Orphans and the Vault', async ({ page }) => {
    // Visits nine pages and waits for each to settle, so it gets more than the usual 30 seconds.
    test.slow()
    server.seed('tasks', [{ id: 't1', title: ATTACK, notes: ATTACK, due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' }])
    server.seed('habits', [{ id: 'h1', title: ATTACK, notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0 }])
    server.seed('quests', [{ id: 'q1', title: ATTACK, details: ATTACK, energy: 'meh', minutes: 30 }])
    server.seed('inbox', [{ id: 'i1', body: ATTACK }])
    server.seed('vault_buckets', [{ id: 'b1', name: ATTACK, position: 9, checkable: false, starred: true }])
    server.seed('vault_items', [{ id: 'v1', bucket_id: 'b1', title: ATTACK, notes: ATTACK, link: 'javascript:window.__hacked=1' }])
    for (const path of ['/tasks', '/habits', '/quests', '/orphans', '/vault', '/vault?bucket=b1', '/']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await notHacked(page)
    }
    // Shown as plain text, exactly as typed.
    await page.goto('/tasks')
    await expect(page.getByText('<img src=x onerror="window.__hacked=1">', { exact: false }).first()).toBeVisible()
    // A Vault link can never be a script: it opens a map search instead.
    await page.goto('/vault?bucket=b1')
    const link = page.getByRole('link', { name: /Open in maps/ })
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\//)
  })

  test('in formatted writing: the journal and Post Its', async ({ page }) => {
    const html = `<p>Hi</p><img src=x onerror="window.__hacked=1"><script>window.__hacked=1</script><a href="javascript:window.__hacked=1">link</a><p onclick="window.__hacked=1">click</p>`
    server.seed('journal_entries', [{ id: 'j1', date: '2026-11-09', body: html, tomorrow: html, better_than_yesterday: true, stats: {}, auto: false, stats_final: true }])
    server.seed('post_its', [{ id: 'p1', body: html, color: 'yellow', position: 0 }])
    await page.goto('/journal')
    const entry = page.getByTestId('journal-entry-2026-11-09')
    await expect(entry.getByTestId('journal-body')).toContainText('Hi')
    await expect(entry.locator('img, script, [onclick]')).toHaveCount(0)
    // The script link loses its address entirely (so it isn't even a link any more).
    await expect(entry.getByTestId('journal-body').getByText('link', { exact: true })).toBeVisible()
    await expect(entry.locator('a[href^="javascript" i]')).toHaveCount(0)
    await entry.getByText('click').first().click()
    await notHacked(page)
    await page.goto('/')
    await expect(page.getByTestId('postit').locator('img, script, [onclick]')).toHaveCount(0)
    await notHacked(page)
  })

  test('in what other people see: an event shown to a guest on the public answer page', async ({ page }) => {
    server.rpcResults.guest_invite = [
      { host_name: ATTACK, guest_name: ATTACK, title: ATTACK, notes: ATTACK, start_date: '2026-11-20', start_time: '19:00:00', end_date: '2026-11-20', end_time: '22:00:00', repeat: 'never', timezone: 'America/New_York', response: 'pending', cancelled: false },
    ]
    await page.goto('/rsvp/inv-1/tok-1')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('<script>')
    await notHacked(page)
    await expect(page.locator('main img, main iframe, main script')).toHaveCount(0)
  })

  test('in a Capture: whatever is typed is saved and shown as text', async ({ page }) => {
    await page.goto('/capture')
    await page.getByRole('group', { name: msg.capture.whereHeading }).getByRole('button', { name: msg.search.type.task, exact: true }).click()
    await page.getByLabel(msg.capture.titleLabel, { exact: true }).fill(ATTACKS[0]!)
    await page.getByTestId('capture-save').click()
    await expect.poll(() => server.written('tasks').at(-1)?.title).toBe(ATTACKS[0])
    await page.goto('/tasks')
    await page.getByRole('tab', { name: msg.tasks.undatedHeading }).click()
    await expect(page.getByText(ATTACKS[0]!)).toBeVisible()
    await notHacked(page)
  })
})

test.describe('Spec §8 Redirects stay inside the app', () => {
  test('the welcome step never sends me to another site', async ({ page }) => {
    server.setProfile({ phone: null })
    await page.goto('/welcome?next=//evil.example/steal')
    await page.getByLabel(/phone/i).first().fill('5550101234')
    await page.getByRole('button', { name: /Continue|Save/ }).first().click()
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/)
  })
})
