// The pictures for Help and the home page (SPEC §5 Home page and Help). Each is saved as public/help/<name>.webp.
// Help pictures have a highlight ring around what to tap; home page pictures (home-*) don't.
import type { Locator, Page } from '@playwright/test'
import type { FakeSupabase } from '../../src/tests/e2e/support/fakeSupabase'
import { messages as msg } from '../../src/messages'
import { DAY, FRIEND, ROUTINE } from './sample'
import { TEST_USER_ID } from '../../src/tests/e2e/support/fakeSupabase'

export interface Shot {
  name: string
  path: string
  seed?: (server: FakeSupabase) => void
  /** Open every Account group (the page itself opens only Your profile). */
  accountOpen?: boolean
  /** Anything to do before the picture: open a window, wait for something. */
  ready?: (page: Page) => Promise<void>
  /** What the highlight ring goes around. */
  ring?: (page: Page) => Locator
}

const openCapture = async (page: Page, text?: string) => {
  await page.getByTestId('capture-button').click()
  const box = page.getByRole('dialog', { name: msg.capture.windowLabel })
  await box.getByRole('textbox').first().waitFor()
  if (text) await box.getByRole('textbox').first().fill(text)
}
const waitFor = (text: string) => async (page: Page) => {
  await page.getByText(text).first().waitFor()
}

export const SHOTS: Shot[] = [
  // ---------- Help ----------
  { name: 'help-getting-around', path: '/tasks', ready: async (p) => { await p.getByTestId('bottom-tabs').getByRole('button', { name: msg.nav.more }).click(); await p.getByTestId('more-sheet').waitFor() }, ring: (p) => p.getByTestId('more-sheet') },
  { name: 'help-capture', path: '/tasks', ready: waitFor('Pay rent'), ring: (p) => p.getByTestId('capture-button') },
  { name: 'help-orphans', path: '/orphans', ready: waitFor('Call the dentist'), ring: (p) => p.getByRole('button', { name: 'Task', exact: true }).locator('..') },
  { name: 'help-tasks', path: '/tasks', ready: waitFor('Pay rent'), ring: (p) => p.getByPlaceholder(msg.tasks.addPlaceholder('today')) },
  { name: 'help-priority', path: '/tasks', ready: async (p) => { await p.getByRole('tab', { name: msg.priority.tabHeading }).click(); await p.getByText('Insulin').first().waitFor() }, ring: (p) => p.getByRole('tab', { name: msg.priority.tabHeading }) },
  { name: 'help-habits', path: '/habits', ready: waitFor('Take meds'), ring: (p) => p.getByRole('button', { name: 'Mark Take meds done' }) },
  { name: 'help-routines', path: '/routines', ready: waitFor('Morning'), ring: (p) => p.getByRole('button', { name: msg.routines.start }).first() },
  { name: 'help-calendar', path: '/calendar', ready: waitFor('November 2026'), ring: (p) => p.getByRole('button', { name: msg.calendar.newEvent }) },
  { name: 'help-inviting', path: `/calendar?date=2026-11-14&event=e2`, ready: async (p) => { await p.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click(); const d = p.getByRole('dialog').last(); await d.getByTestId('event-people').waitFor() }, ring: (p) => p.getByTestId('event-people').locator('summary') },
  { name: 'help-scheduling', path: `/calendar?date=2026-11-14&event=e2`, seed: (server) => {
      server.rpcResults.my_connections = [{ friend_id: FRIEND, display_name: 'Jo Park', avatar_url: null, since: '2026-11-01T00:00:00Z' }]
      server.rpcResults.event_people = [{ invite_id: 'inv-jo', name: 'Jo Park', email: null, phone: null, response: 'yes', is_me: false, user_id: FRIEND, optional: false }]
      const shares = (user_id: string) => ({ user_id, timezone: 'America/New_York', kind: 'shares', weekday: null, start_date: null, start_time: null, end_date: null, end_time: null, repeat: null, busy: false, level: null })
      server.rpcResults.free_busy = [shares(FRIEND), shares(TEST_USER_ID), { ...shares(FRIEND), kind: 'rule', weekday: 6, start_time: '18:00:00', end_time: '23:00:00', busy: true, level: 'busy' }]
    }, ready: async (p) => {
      await p.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
      const d = p.getByRole('dialog').last()
      const fold = d.getByTestId('event-schedule')
      if (!(await fold.evaluate((x) => (x as HTMLDetailsElement).open))) await fold.locator('summary').click()
      await d.getByTestId('find-a-time-button').click()
      await d.getByTestId('suggested-time').first().waitFor()
    }, ring: (p) => p.getByTestId('find-a-time') },
  { name: 'help-connections', path: '/connections', ring: (p) => p.getByLabel(msg.connections.askLabel) },
  { name: 'help-vault', path: '/vault', ready: waitFor('Books to read'), ring: (p) => p.getByText('Books to read').first() },
  { name: 'help-journal', path: '/journal', ready: async (p) => { await p.getByTestId('journal-writing').waitFor() }, ring: (p) => p.getByTestId('journal-writing') },
  { name: 'help-journal-lock', path: '/account', accountOpen: true, ready: async (p) => { await p.getByTestId('journal-lock').waitFor() }, ring: (p) => p.getByTestId('journal-lock') },
  { name: 'help-quests', path: '/quests', ready: waitFor('Repot the basil'), ring: (p) => p.getByRole('button', { name: msg.quests.pick }) },
  { name: 'help-focus', path: '/tasks', ready: waitFor('Pay rent'), ring: (p) => p.getByTestId('focus-open') },
  { name: 'help-dashboard', path: '/', ready: async (p) => { await p.getByTestId('postit').first().waitFor() }, ring: (p) => p.getByTestId('dash-postits') },
  { name: 'help-trophies', path: '/', ready: async (p) => { await p.getByTestId('dash-trophies').waitFor() }, ring: (p) => p.getByTestId('dash-trophies') },
  { name: 'help-alerts', path: '/tasks', ready: async (p) => { await waitFor('Pay rent')(p); await p.getByTestId('alerts-count').waitFor(); await p.getByTestId('alerts-bell').click(); await p.getByTestId('alert').first().waitFor() }, ring: (p) => p.getByTestId('alerts-list') },
  { name: 'help-reminders', path: '/account', accountOpen: true, ready: async (p) => { await p.getByTestId('notification-settings').waitFor() }, ring: (p) => p.getByTestId('notification-settings') },
  { name: 'help-search', path: '/tasks', ready: waitFor('Pay rent'), ring: (p) => p.getByRole('button', { name: msg.search.open }) },
  { name: 'help-offline', path: '/tasks', ready: waitFor('Pay rent'), ring: (p) => p.getByTestId('sync-indicator') },
  { name: 'help-data', path: '/account', accountOpen: true, ready: async (p) => { await p.getByTestId('data-export').waitFor() }, ring: (p) => p.getByTestId('data-export') },

  // ---------- Home page ----------
  { name: 'home-capture', path: '/tasks', ready: async (p) => { await waitFor('Pay rent')(p); await openCapture(p, 'Call Mom back about Sunday') } },
  { name: 'home-tasks', path: '/tasks', ready: waitFor('Pay rent') },
  { name: 'home-habits', path: '/habits', ready: waitFor('Take meds') },
  { name: 'home-routine', path: `/routines/${ROUTINE}/run`, ready: async (p) => { await p.getByTestId('current-step').waitFor() } },
  { name: 'home-calendar', path: `/calendar?date=${DAY}`, ready: waitFor('November 2026') },
  { name: 'home-vault', path: '/vault?bucket=b1', ready: waitFor('Dune') },
  { name: 'home-journal', path: '/journal', ready: async (p) => { await p.getByTestId('journal-writing').waitFor() } },
  { name: 'home-quests', path: '/quests', ready: async (p) => { await waitFor('Repot the basil')(p); await p.getByRole('button', { name: msg.quests.pick }).click(); await p.getByText(/^Past you (thought|left)/).waitFor() } },
  { name: 'home-dashboard', path: '/', ready: async (p) => { await p.getByTestId('postit').first().waitFor() } },
]
