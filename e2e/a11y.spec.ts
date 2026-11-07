import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { FakeSupabase } from './support/fakeSupabase'

// SPEC §2: every screen meets WCAG 2.2 Level AA. axe checks every page and the main windows, in light and dark.
// What axe can't check (keyboard order, meaning, zoom and reflow) is reviewed by hand and covered by other tests.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T01:00:00Z') // Tue Nov 10 2026, 8:00 pm in New York
const RID = 'aaaaaaaa-0000-4000-8000-000000000001'
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
let server: FakeSupabase

function seedData() {
  const day = '2026-11-10'
  server.seed('tasks', [
    { id: 't1', title: 'pay rent', notes: 'before 5', due_date: day, priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' },
    { id: 't2', title: 'email Sam', notes: null, due_date: day, priority: 1, status: 'done', source: 'manual', created_at: '2026-11-01T00:00:02Z' },
  ])
  server.seed('habits', [
    { id: 'h1', title: 'Take meds', notify_time: '08:00', timer_minutes: 120, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: true, current_streak: 3, best_streak: 5 },
    { id: 'h2', title: 'Run', notify_time: null, timer_minutes: null, weekdays: [1, 3, 5], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 2 },
  ])
  server.seed('routines', [{ id: RID, title: 'Morning', notify_time: '07:00', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' }])
  server.seed('routine_steps', [
    { id: '00000001-0000-4000-8000-000000000001', routine_id: RID, position: 0, title: 'Brush teeth', start_date: '2026-11-01' },
    { id: '00000002-0000-4000-8000-000000000002', routine_id: RID, position: 1, title: 'Shower', start_date: '2026-11-01' },
  ])
  server.seed('quests', [{ id: 'q1', title: 'Build a birdhouse', details: 'Use the scrap wood', energy: 'meh', minutes: 60, completed_at: null }])
  server.seed('inbox', [{ id: 'i1', body: 'call the dentist', created_at: '2026-11-09T12:00:00Z' }])
  server.seed('journal_entries', [
    { id: 'j9', date: '2026-11-09', body: '<p>A <strong>good</strong> day.</p>', tomorrow: '<p>Sleep early</p>', better_than_yesterday: true, stats: {}, auto: false, stats_final: true },
  ])
  server.seed('vault_buckets', [{ id: 'b1', name: 'Books', position: 5, checkable: true, starred: true }])
  server.seed('vault_items', [
    { id: 'v1', bucket_id: 'b1', title: 'Dune', notes: 'Recommended by Sam', rating: 4, link: 'example.com', checked: false },
    { id: 'v2', bucket_id: 'b1', title: 'Emma', notes: null, rating: null, link: null, checked: true },
  ])
  server.seed('events', [
    { id: 'e1', title: 'Dentist', notes: null, start_date: day, start_time: '15:00:00', end_date: day, end_time: '16:00:00', repeat: 'never', reminder_minutes: 30 },
  ])
}

async function scan(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  const problems = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    where: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1).join(' ')}`),
  }))
  expect(problems, `${what}: ${JSON.stringify(problems, null, 2)}`).toEqual([])
}

const PAGES: [string, string, (page: Page) => Promise<void>][] = [
  ['Dashboard', '/', (p) => expect(p.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()],
  ['Tasks', '/tasks', (p) => expect(p.getByText('pay rent')).toBeVisible()],
  ['Habits', '/habits', (p) => expect(p.getByText('Take meds').first()).toBeVisible()],
  ['Routines', '/routines', (p) => expect(p.getByText('Morning').first()).toBeVisible()],
  ['Routine run', `/routines/${RID}/run`, (p) => expect(p.getByTestId('current-step')).toBeVisible()],
  ['Quests', '/quests', (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible()],
  ['Orphans', '/orphans', (p) => expect(p.getByText('call the dentist')).toBeVisible()],
  ['Journal', '/journal', (p) => expect(p.getByTestId('journal-entry-2026-11-09')).toBeVisible()],
  ['Vault', '/vault', (p) => expect(p.getByText('Books').first()).toBeVisible()],
  ['Vault bucket', '/vault?bucket=b1', (p) => expect(p.getByText('Dune')).toBeVisible()],
  ['Calendar', '/calendar', (p) => expect(p.locator('.cal-wrap').getByText('Dentist').first()).toBeVisible()],
  ['Account', '/account', (p) => expect(p.getByRole('heading', { name: 'Your profile', level: 2 })).toBeVisible()],
  ['Capture page', '/capture', (p) => expect(p.getByRole('heading', { name: 'What are you capturing?' })).toBeVisible()],
  ['Privacy', '/privacy', (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible()],
  ['Terms', '/terms', (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible()],
]

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Spec §2 WCAG 2.2 AA (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      server = new FakeSupabase()
      await server.install(page)
      seedData()
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.clock.install({ time: NOW })
    })

    for (const [name, path, ready] of PAGES) {
      test(`${name} page`, async ({ page }) => {
        await page.goto(path)
        await ready(page)
        await scan(page, name)
      })
    }

    test('Capture window, with the Habit form', async ({ page }) => {
      await page.goto('/habits')
      await page.getByRole('button', { name: '+ Capture' }).click()
      await scan(page, 'Capture types')
      await page.getByRole('group', { name: 'What are you capturing?' }).getByRole('button', { name: 'Habit', exact: true }).click()
      await scan(page, 'Capture habit')
    })

    test('Search window with results', async ({ page }) => {
      await page.goto('/tasks')
      await page.getByRole('button', { name: /Search/ }).first().click()
      await page.getByRole('searchbox').fill('a')
      await scan(page, 'Search')
    })

    test('New habit, routine and event windows', async ({ page }) => {
      await page.goto('/habits')
      await page.getByRole('button', { name: '+ New habit' }).click()
      await scan(page, 'New habit')
      await page.goto('/routines')
      await page.getByRole('button', { name: /New routine/ }).click()
      await scan(page, 'New routine')
      await page.goto('/calendar')
      await page.getByRole('button', { name: '+ New event' }).click()
      await scan(page, 'New event')
    })

    test('Vault item editor and delete confirmation', async ({ page }) => {
      await page.goto('/vault?bucket=b1')
      await page.getByRole('button', { name: 'Open Dune' }).click()
      await scan(page, 'Vault item editor')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Delete Dune' }).click()
      await scan(page, 'Delete item confirmation')
    })

    test('Journal full screen writing', async ({ page }) => {
      await page.goto('/journal')
      await page.getByRole('toolbar', { name: 'Formatting: How the day went' }).getByRole('button', { name: 'Full screen' }).click()
      await scan(page, 'Full screen writing')
    })

    test('Sign-in page (signed out)', async ({ browser, baseURL }) => {
      const context = await browser.newContext({ colorScheme: scheme, baseURL })
      const page = await context.newPage()
      await page.goto('/sign-in')
      await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
      await scan(page, 'Sign-in')
      await context.close()
    })

    test('Guest answer page', async ({ page }) => {
      server.rpcResults.guest_invite = [
        { host_name: 'Alice Able', guest_name: 'Carol', title: 'Birthday party', notes: 'Bring games', start_date: '2026-11-20', start_time: '19:00:00', end_date: '2026-11-20', end_time: '22:00:00', repeat: 'never', timezone: 'America/New_York', response: 'pending', cancelled: false },
      ]
      await page.goto('/rsvp/inv-carol/tok-carol')
      await expect(page.getByRole('heading', { name: 'Birthday party' })).toBeVisible()
      await scan(page, 'Guest page')
    })
  })
}

test.describe('Spec §2 WCAG 2.2 AA: by hand checks made automatic', () => {
  test.beforeEach(async ({ page }) => {
    server = new FakeSupabase()
    await server.install(page)
    seedData()
    await page.clock.install({ time: NOW })
  })

  test('every page reflows at 320 px wide with no sideways scrolling (1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    for (const [name, path, ready] of PAGES) {
      await page.goto(path)
      await ready(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0)
    }
  })

  test('each page has its own title (2.4.2)', async ({ page }) => {
    await page.goto('/journal')
    await expect(page).toHaveTitle('Journal · My Brain')
    await page.goto('/vault')
    await expect(page).toHaveTitle('The Vault · My Brain')
  })

  test('a Skip to content link is the first thing the keyboard reaches, and jumps past the menu (2.4.1)', async ({ page }) => {
    await page.goto('/journal')
    await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeFocused()
  })

  test('focused controls show a visible focus ring (2.4.7)', async ({ page }) => {
    await page.goto('/vault?bucket=b1')
    await expect(page.getByText('Dune')).toBeVisible()
    const box = page.getByRole('textbox', { name: 'Add to Books' })
    await box.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const outline = await box.evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth)
    expect(outline).toBe('solid 3px')
  })

  test('buckets can be sorted by tapping instead of dragging (2.5.7)', async ({ page }) => {
    await page.goto('/vault')
    const names = page.getByTestId('vault-bucket').locator('span.font-medium')
    await expect(names.first()).toBeVisible()
    const before = await names.allTextContents()
    const last = before.at(-1)!.replace('★ ', '').trim()
    await page.getByRole('button', { name: new RegExp(`^Reorder ${last}`) }).click()
    await page.getByRole('group', { name: `Move ${last}` }).getByRole('button', { name: /Move up/ }).click()
    await expect(names).toHaveText([...before.slice(0, -2), before.at(-1)!, before.at(-2)!])
  })

  test('the page name is announced after moving to another page (4.1.3)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await page.goto('/journal')
    await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeVisible()
    const menu = page.getByRole('button', { name: 'Menu' })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Habits' }).click()
    await expect(page.getByTestId('page-announcement')).toHaveText('Habits')
  })
})

test.describe('Spec §2 Windows keep focus inside while open and give it back when they close', () => {
  test.beforeEach(async ({ page }) => {
    server = new FakeSupabase()
    await server.install(page)
    seedData()
    await page.clock.install({ time: NOW })
  })

  async function tabsStayInside(page: Page, modal: ReturnType<Page['getByRole']>, presses = 25) {
    for (let i = 0; i < presses; i++) {
      await page.keyboard.press('Tab')
      expect(await modal.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} left the window`).toBe(true)
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await modal.evaluate((el) => el.contains(document.activeElement)), `Shift+Tab ${i + 1} left the window`).toBe(true)
    }
  }

  test('the Capture window traps Tab, and Escape returns focus to the Capture button', async ({ page }) => {
    await page.goto('/habits')
    const open = page.getByRole('button', { name: '+ Capture' })
    await open.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Capture' })
    await expect(dialog).toBeVisible()
    await tabsStayInside(page, dialog)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()
  })

  test('a confirmation over an editor traps Tab; closing each returns focus to what opened it', async ({ page }) => {
    await page.goto('/vault?bucket=b1')
    const openItem = page.getByRole('button', { name: 'Open Dune' })
    await openItem.focus()
    await page.keyboard.press('Enter')
    const editor = page.getByRole('dialog', { name: 'Edit item' })
    await expect(editor).toBeVisible()
    const del = editor.getByRole('button', { name: /Delete/ })
    await del.focus()
    await page.keyboard.press('Enter')
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await tabsStayInside(page, confirm, 6)
    await confirm.getByRole('button', { name: /Keep/ }).click()
    await expect(del).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
    await expect(openItem).toBeFocused()
  })

  test('the Search window traps Tab and gives focus back when closed', async ({ page }) => {
    await page.goto('/tasks')
    await expect(page.getByText('pay rent')).toBeVisible()
    const open = page.getByRole('button', { name: /Search/ }).first()
    await expect(open).toBeVisible()
    await open.focus()
    await expect(open).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('searchbox') })
    await expect(dialog).toBeVisible()
    await page.getByRole('searchbox').fill('a')
    await tabsStayInside(page, dialog)
    await page.keyboard.press('Escape')
    await expect(open).toBeFocused()
  })

  test('full screen writing traps Tab', async ({ page }) => {
    await page.goto('/journal')
    await page.getByRole('toolbar', { name: 'Formatting: How the day went' }).getByRole('button', { name: 'Full screen' }).click()
    const dialog = page.getByRole('dialog', { name: 'How the day went' })
    await expect(dialog).toBeVisible()
    await tabsStayInside(page, dialog, 15)
  })

  test('on a phone the open menu traps Tab, and Escape closes it and returns focus to Menu', async ({ page }, info) => {
    test.skip(info.project.name !== 'android-phone', 'the menu is a window only on a phone')
    await page.goto('/tasks')
    const menu = page.getByRole('button', { name: 'Menu' })
    await menu.click()
    const nav = page.getByRole('dialog', { name: 'Menu' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link').first()).toBeFocused()
    await tabsStayInside(page, nav)
    await page.keyboard.press('Escape')
    await expect(nav).toBeHidden()
    await expect(menu).toBeFocused()
  })
})
