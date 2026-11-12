import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openAttendees } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
import { isPhone, isSafari } from '../support/devices'
import { goTo } from '../support/nav'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// SPEC §2: every screen meets WCAG 2.2 Level AA. axe checks every page and the main windows, in light and dark.
// What axe can't check (keyboard order, meaning, zoom and reflow) is reviewed by hand and covered by other tests.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-11T01:00:00Z') // Tue Nov 10 2026, 8:00 pm in New York
const RID = 'aaaaaaaa-0000-4000-8000-000000000001'
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
let server: FakeSupabase

// Text people type is tested long, too (user rule): a long sentence, a paragraph, and an unbroken string (a pasted
// link) that can't wrap at spaces. Each kind of thing I can type gets one long example.
const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'
const PARAGRAPH =
  'Past me wrote a whole paragraph here because some days need it. It goes on for a while, with several sentences, so the page has to wrap it nicely. Then it keeps going a little more, just to be sure nothing gets cut off or pushes the page sideways on a small phone.'
const LONG_WORD = 'https://example.com/a/really/long/link/that/someone/pasted/without/any/spaces/in/it/at/all?with=query&and=more'

function seedLong() {
  const day = '2026-11-10'
  server.seed('tasks', [{ id: 't-long', title: LONG_LINE, notes: `${PARAGRAPH}
${LONG_WORD}`, due_date: day, priority: 2, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:03Z' }])
  server.seed('habits', [{ id: 'h-long', title: LONG_LINE, notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: false, current_streak: 12, best_streak: 40 }])
  server.seed('routines', [{ id: 'aaaaaaaa-0000-4000-8000-0000000000ff', title: LONG_LINE, notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01' }])
  server.seed('routine_steps', [{ id: '00000003-0000-4000-8000-000000000003', routine_id: RID, position: 2, title: LONG_WORD, start_date: '2026-11-01' }])
  server.seed('quests', [{ id: 'q-long', title: LONG_LINE, details: `${PARAGRAPH} ${LONG_WORD}`, energy: 'meh', minutes: 60, completed_at: null }])
  server.seed('inbox', [{ id: 'i-long', body: `${PARAGRAPH} ${LONG_WORD}`, created_at: '2026-11-09T13:00:00Z' }])
  server.seed('people', [{ id: 'pe-long', name: LONG_LINE, email: 'areallylongemailaddressthatsomeonetypedwithoutanybreaksatall@example.com', phone: null }])
  server.seed('journal_entries', [
    { id: 'j8', date: '2026-11-08', body: `<p>${PARAGRAPH}</p><p>${LONG_WORD}</p>`, tomorrow: `<p>${LONG_WORD}</p>`, better_than_yesterday: false, stats: {}, auto: false, stats_final: true },
  ])
  server.seed('post_its', [{ id: 'p-long', body: `<p>${LONG_WORD}</p><p>${PARAGRAPH}</p>`, color: 'yellow', position: -1 }])
  server.seed('vault_buckets', [{ id: 'b-long', name: LONG_LINE, position: 6, checkable: false, starred: true }])
  server.seed('vault_items', [{ id: 'v-long', bucket_id: 'b-long', title: LONG_WORD, notes: PARAGRAPH, rating: 3, link: LONG_WORD, checked: false, created_at: '2026-11-09T12:30:00Z' }])
  server.seed('events', [{ id: 'e-long', title: LONG_LINE, notes: PARAGRAPH, start_date: day, start_time: null, end_date: day, end_time: null, repeat: 'never', reminder_minutes: null }])
  server.seed('tags', [{ id: 'tag-long', name: LONG_WORD.slice(0, 60) }])
  server.seed('notifications', [
    { id: 'nt1', kind: 'habit', item_id: null, title: 'Take meds', body: 'Reminder: Past you asked that you take your meds.', url: '/habits', local_date: day, sent_at: '2026-11-10T13:00:00Z' },
    { id: 'nt2', kind: 'event_message', item_id: null, title: LONG_LINE, body: `${PARAGRAPH} ${LONG_WORD}`, url: '/calendar', local_date: day, sent_at: '2026-11-10T14:00:00Z' },
  ])
  server.seed('item_tags', [{ id: 'it-long', item_type: 'journal_entry', item_id: 'j8', tag_id: 'tag-long' }])
}

function seedData() {
  seedLong()
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
  server.seed('post_its', [
    { id: 'p1', body: '<p><strong>Call the vet</strong></p><ul><li><p>shots</p></li></ul>', color: 'yellow', position: 0 },
    { id: 'p2', body: '<p>Pink idea</p>', color: 'pink', position: 1 },
    { id: 'p3', body: '<p>Blue idea</p>', color: 'blue', position: 2 },
    { id: 'p4', body: '<p>Green idea</p>', color: 'green', position: 3 },
  ])
  server.seed('vault_buckets', [{ id: 'b1', name: 'Books', position: 5, checkable: true, starred: true }])
  server.seed('vault_items', [
    { id: 'v1', bucket_id: 'b1', title: 'Dune', notes: 'Recommended by Sam', rating: 4, link: 'example.com', checked: false },
    { id: 'v2', bucket_id: 'b1', title: 'Emma', notes: null, rating: null, link: null, checked: true },
    { id: 'v3', bucket_id: 'b1', title: '"Do you want a haircut? You have gorgeous hair" - a friend of Rae, who said it at the market on Saturday', notes: null, rating: null, link: null, checked: false, created_at: '2026-11-09T12:00:00Z' },
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
  ['Dashboard', '/', (p) => expect(p.getByTestId('dash-favorite').first()).toBeVisible()],
  ['Tasks', '/tasks', (p) => expect(p.getByText('pay rent')).toBeVisible()],
  ['Habits', '/habits', (p) => expect(p.getByText('Take meds').first()).toBeVisible()],
  ['Routines', '/routines', (p) => expect(p.getByText('Morning').first()).toBeVisible()],
  ['Routine run', `/routines/${RID}/run`, (p) => expect(p.getByTestId('current-step')).toBeVisible()],
  ['Quests', '/quests', (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible()],
  ['Orphans', '/orphans', (p) => expect(p.getByText('call the dentist')).toBeVisible()],
  ['Journal', '/journal', (p) => expect(p.getByTestId('journal-entry-2026-11-09')).toBeVisible()],
  ['Vault', '/vault', (p) => expect(p.getByText('Books').first()).toBeVisible()],
  ['Vault bucket', '/vault?bucket=b1', (p) => expect(p.getByText('Dune')).toBeVisible()],
  ['Calendar', '/calendar', (p) => expect(p.locator('.cal-wrap').getByText('pay rent').first()).toBeVisible()],
  ['Account', '/account', (p) => expect(p.getByRole('heading', { name: msg.profile.settingsHeading, level: 2 })).toBeVisible()],
  ['Connections', '/connections', (p) => expect(p.getByRole('heading', { name: msg.nav.connections, level: 1 })).toBeVisible()],
  ['Tags', '/tags', (p) => expect(p.getByTestId('tag-row').first()).toBeVisible()],
  ['Capture page', '/capture', (p) => expect(p.getByRole('heading', { name: msg.capture.typeHeading })).toBeVisible()],
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
      await expect(page.getByRole('heading', { name: msg.nav.habits, level: 1 })).toBeVisible()
      await page.getByRole('button', { name: '+ Capture' }).click()
      await expect(page.getByRole('group', { name: msg.capture.typeHeading })).toBeVisible()
      await scan(page, 'Capture types')
      await page.getByRole('group', { name: msg.capture.typeHeading }).getByRole('button', { name: msg.search.type.habit, exact: true }).click()
      await scan(page, 'Capture habit')
      await page.getByRole('button', { name: msg.legal.back }).click()
      await page.getByRole('group', { name: msg.capture.typeHeading }).getByRole('button', { name: msg.postIts.label, exact: true }).click()
      await scan(page, 'Capture Post It')
    })

    test('Search window with results', async ({ page }) => {
      await page.goto('/tasks')
      // Wait for the page to be ready, or the click can land before Search is wired up.
      await expect(page.getByRole('heading', { name: msg.nav.home, level: 1 })).toBeVisible()
      await page.getByRole('button', { name: /Search/ }).first().click()
      await expect(page.getByRole('searchbox')).toBeVisible()
      await page.getByRole('searchbox').fill('a')
      await scan(page, 'Search')
    })

    test('New habit, routine and event windows', async ({ page }) => {
      await page.goto('/habits')
      await expect(page.getByRole('heading', { name: msg.nav.habits, level: 1 })).toBeVisible()
      await page.getByRole('button', { name: msg.habits.add }).click()
      await scan(page, 'New habit')
      await page.goto('/routines')
      await expect(page.getByRole('heading', { name: msg.nav.routines, level: 1 })).toBeVisible()
      await page.getByRole('button', { name: /New routine/ }).click()
      await scan(page, 'New routine')
      await page.goto('/calendar')
      await expect(page.getByRole('heading', { name: msg.nav.calendar, level: 1 })).toBeVisible()
      await page.getByRole('button', { name: msg.calendar.newEvent }).click()
      await scan(page, 'New event')
      await openAttendees(page.getByRole('dialog', { name: msg.calendar.editor.newHeading }))
      await page.getByRole('dialog', { name: msg.calendar.editor.newHeading }).getByRole('button', { name: msg.invites.contacts }).click()
      await expect(page.getByRole('dialog', { name: msg.contacts.heading }).getByTestId('contact')).toHaveCount(1)
      await scan(page, 'Contacts window')
      await page.goto('/tasks')
      await expect(page.getByRole('heading', { name: msg.nav.home, level: 1 })).toBeVisible()
      await expect(page.getByTestId('alerts-bell').first()).toHaveAccessibleName(/Alerts, \d+ new/)
      await page.getByTestId('alerts-bell').first().click()
      await expect(page.getByRole('dialog', { name: msg.alerts.heading })).toBeVisible()
      await scan(page, 'Alerts window')
    })

    test('Calendar item window, date grid and More details (feedback round 4)', async ({ page }, info) => {
      await page.goto('/calendar?date=2026-11-10&event=e-long')
      const view = page.getByTestId('calendar-item')
      await expect(view).toBeVisible()
      await scan(page, 'Calendar item window')
      await view.getByRole('button', { name: msg.calendar.view.edit }).click()
      const editor = page.getByRole('dialog', { name: msg.calendar.editor.heading })
      await editor.getByTestId('event-schedule').locator('summary').click()
      if (!isPhone(info)) await editor.getByRole('combobox', { name: 'Starts Date' }).click()
      await scan(page, 'Event editor with Schedule and the date grid open')
    })

    test('Vault item editor and the Undo bar', async ({ page }) => {
      await page.goto('/vault?bucket=b1')
      await page.getByRole('button', { name: 'Open Dune' }).click()
      await scan(page, 'Vault item editor')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Delete Dune' }).click()
      await expect(page.getByTestId('undo-bar').getByRole('button', { name: msg.undo.undo })).toBeVisible()
      await scan(page, 'Undo bar')
    })

    test('Post It being edited on the Dashboard', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('postit').getByRole('button', { name: msg.postIts.edit }).click()
      await scan(page, 'Post It editing')
    })

    test('Focus timer, full screen and minimized', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
      await page.getByTestId('focus-open').locator('visible=true').click()
      await expect(page.getByRole('dialog', { name: msg.focus.menu })).toBeVisible()
      await scan(page, 'Focus timer')
      await page.getByRole('button', { name: msg.focus.minimize }).click()
      await expect(page.getByTestId('focus-pill')).toBeVisible()
      await scan(page, 'Focus timer pill')
    })

    test('Journal full screen writing', async ({ page }) => {
      await page.goto('/journal')
      await page.getByRole('toolbar', { name: 'Formatting: How the day went' }).getByRole('button', { name: msg.editor.fullScreen }).click()
      await scan(page, 'Full screen writing')
    })

    test('Sign-in page (signed out)', async ({ browser, baseURL }) => {
      const context = await browser.newContext({ colorScheme: scheme, baseURL })
      const page = await context.newPage()
      await page.goto('/sign-in')
      await expect(page.getByRole('button', { name: msg.signIn.button })).toBeVisible()
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
    // Visits every page and waits for each to settle, so it gets more than the usual 30 seconds.
    test.slow()
    await page.setViewportSize({ width: 320, height: 640 })
    for (const [name, path, ready] of PAGES) {
      await page.goto(path)
      await ready(page)
      // Wait for every list to fill in from the device's data before measuring.
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      const { overflow, culprits } = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const culprits = [...document.querySelectorAll('main *')]
          .filter((el) => el.getBoundingClientRect().right > vw + 1)
          .slice(-4)
          .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}"> ${(el.textContent ?? '').slice(0, 40)}`)
        return { overflow: document.documentElement.scrollWidth - vw, culprits }
      })
      expect(overflow, `${name} scrolls sideways because of: ${culprits.join(' | ')}`).toBeLessThanOrEqual(0)
    }
  })

  test('each page has its own title (2.4.2)', async ({ page }) => {
    await page.goto('/journal')
    await expect(page).toHaveTitle('Journal · My Brain')
    await page.goto('/vault')
    await expect(page).toHaveTitle('The Vault · My Brain')
  })

  test('a Skip to content link is the first thing the keyboard reaches, and jumps past the menu (2.4.1)', async ({ page }, info) => {
    test.skip(isSafari(info), 'Safari only Tabs to links with Option+Tab, a Safari setting')
    await page.goto('/journal')
    await expect(page.getByRole('heading', { name: msg.nav.journal, level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: msg.skipToContent })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: msg.nav.journal, level: 1 })).toBeFocused()
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

  test('routine steps can be sorted by tapping instead of dragging (2.5.7)', async ({ page }) => {
    await page.goto('/routines')
    await page.locator('[data-testid^="routine-"]').first().getByRole('heading').click()
    const dialog = page.getByRole('dialog')
    const steps = dialog.getByTestId('routine-step-row').locator('input')
    await expect(steps.first()).toHaveValue('Brush teeth')
    await dialog.getByRole('button', { name: /^Reorder Brush teeth/ }).click()
    await dialog.getByRole('group', { name: 'Move Brush teeth' }).getByRole('button', { name: /Move down/ }).click()
    await expect(steps.nth(1)).toHaveValue('Brush teeth')
  })


  test('the page name is announced after moving to another page (4.1.3)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: msg.dashboard.heading, level: 1 })).toBeVisible()
    await page.goto('/journal')
    await expect(page.getByRole('heading', { name: msg.nav.journal, level: 1 })).toBeVisible()
    await goTo(page, 'Habits')
    await expect(page.getByTestId('page-announcement')).toHaveText(msg.nav.habits)
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
    await expect(page.getByRole('heading', { name: msg.nav.habits, level: 1 })).toBeVisible()
    const open = page.getByRole('button', { name: '+ Capture' })
    await open.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: msg.capture.openButton })
    await expect(dialog).toBeVisible()
    await tabsStayInside(page, dialog)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()
  })

  test('a confirmation over an editor traps Tab; closing each returns focus to what opened it', async ({ page }) => {
    // Deleting a habit still asks first (it removes its history, SPEC §2).
    await page.goto('/habits')
    const openItem = page.getByRole('button', { name: /^Take meds/ }).first()
    await openItem.focus()
    await page.keyboard.press('Enter')
    const editor = page.getByRole('dialog', { name: msg.habits.editor.heading })
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
    await page.getByRole('toolbar', { name: 'Formatting: How the day went' }).getByRole('button', { name: msg.editor.fullScreen }).click()
    const dialog = page.getByRole('dialog', { name: msg.journal.writeLabel })
    await expect(dialog).toBeVisible()
    await tabsStayInside(page, dialog, 15)
  })

  test('on a phone the More panel traps Tab, and Escape closes it and returns focus to More', async ({ page }, info) => {
    test.skip(!isPhone(info) || isSafari(info), 'the More panel is a window only on a phone; Safari Tabs to links only with Option+Tab')
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: msg.nav.home, level: 1 })).toBeVisible()
    const more = page.getByTestId('bottom-tabs').getByRole('button', { name: /^More/ })
    await more.click()
    const sheet = page.getByRole('dialog', { name: msg.nav.more })
    await expect(sheet).toBeVisible()
    await tabsStayInside(page, sheet)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(more).toBeFocused()
  })
})

test.describe('Spec §5 Time fields: type or pick (computer); the device picker on a phone', () => {
  test.beforeEach(async ({ page }) => {
    server = new FakeSupabase()
    await server.install(page)
    await page.clock.install({ time: NOW })
  })

  test('on a phone the device time picker is used', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone only')
    await page.goto('/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    await page.getByTestId('habit-reminders').locator('summary').click()
    await expect(page.getByLabel(msg.habits.editor.notifyTime)).toHaveAttribute('type', 'time')
  })

  test.describe('on a computer', () => {
    test.beforeEach(({}, info) => {
      test.skip(isPhone(info), 'computer only')
    })
    const openEditor = async (page: Page) => {
      await page.goto('/habits')
      await page.getByRole('button', { name: msg.habits.add }).click()
      const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
      await dialog.getByLabel(msg.capture.titleLabel).fill('Stretch')
      await dialog.getByTestId('habit-reminders').locator('summary').click()
      return dialog
    }

    test('typing "830p" saves 20:30 and shows "8:30 pm"', async ({ page }) => {
      const dialog = await openEditor(page)
      const box = dialog.getByRole('combobox', { name: msg.habits.editor.notifyTime })
      await box.fill('830p')
      await box.press('Tab')
      await expect(box).toHaveValue('8:30 pm')
      await dialog.getByRole('button', { name: msg.capture.save }).click()
      await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ title: 'Stretch', notify_time: '20:30' })
    })

    test('clicking opens a list every 15 minutes; a time is picked with the mouse', async ({ page }) => {
      const dialog = await openEditor(page)
      const box = dialog.getByRole('combobox', { name: msg.habits.editor.notifyTime })
      await box.click()
      await expect(box).toHaveAttribute('aria-expanded', 'true')
      const list = dialog.getByRole('listbox', { name: msg.timeInput.listLabel })
      await expect(list.getByRole('option')).toHaveCount(96)
      await list.getByRole('option', { name: '7:15 am' }).click()
      await expect(box).toHaveValue('7:15 am')
      await expect(list).toBeHidden()
      await dialog.getByRole('button', { name: msg.capture.save }).click()
      await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ notify_time: '07:15' })
    })

    test('the keyboard works: Down opens and moves, Enter picks, Escape closes only the list', async ({ page }) => {
      const dialog = await openEditor(page)
      const box = dialog.getByRole('combobox', { name: msg.habits.editor.notifyTime })
      await box.focus()
      await page.keyboard.press('ArrowDown')
      await expect(box).toHaveAttribute('aria-activedescendant', /opt-0800$/)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(box).toHaveValue('8:30 am')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Escape')
      await expect(box).toHaveAttribute('aria-expanded', 'false')
      await expect(dialog).toBeVisible()
    })

    test('something that is not a time goes back to the saved time; clearing it leaves no time', async ({ page }) => {
      const dialog = await openEditor(page)
      const box = dialog.getByRole('combobox', { name: msg.habits.editor.notifyTime })
      await box.fill('9am')
      await box.press('Tab')
      await box.fill('banana')
      await box.press('Tab')
      await expect(box).toHaveValue('9:00 am')
      await box.fill('')
      await box.press('Tab')
      await dialog.getByRole('button', { name: msg.capture.save }).click()
      await expect.poll(() => server.written('habits').at(-1)).toMatchObject({ notify_time: null })
    })

    test('the open list passes the accessibility checks', async ({ page }) => {
      const dialog = await openEditor(page)
      await dialog.getByRole('combobox', { name: msg.habits.editor.notifyTime }).click()
      await scan(page, 'Time list open')
    })
  })
})
