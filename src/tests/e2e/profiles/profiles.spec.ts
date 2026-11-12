import { expect, test, type Page } from '@playwright/test'
import { openAttendees } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const BOB = '22222222-2222-4222-8222-222222222222'
const PARTY = 'eeeeeeee-0000-4000-8000-000000000001'
const PICNIC = 'eeeeeeee-0000-4000-8000-000000000002'
const m = msg.personProfile
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})
async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const rpc = (name: string) => server.rpcArgs.filter((c) => c.name === name)
const bob = (over: Record<string, unknown> = {}) => [{
  display_name: 'Bob Baker',
  avatar_url: null,
  badges: [{ kind: 'habit_streak', earned_at: '2026-11-01T00:00:00Z', levels: ['2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z'] }],
  invited_events: [],
  ...over,
}]
const event = (id: string, title: string, date: string) => ({ id, title, notes: null, start_date: date, start_time: '19:00:00', end_date: date, end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null })

test.describe('Spec §5 Profiles', () => {
  test('a connection’s name opens their profile: picture, name and earned trophies, read through the server check', async ({ page }) => {
    server.rpcResults.my_connections = [{ friend_id: BOB, display_name: 'Bob Baker', avatar_url: null, since: '2026-11-01T00:00:00Z' }]
    server.rpcResults.connection_profile = bob()
    await open(page, '/connections')
    await page.getByRole('link', { name: m.openLabel('Bob Baker') }).click()
    await expect(page).toHaveURL(new RegExp(`/people/${BOB}$`))
    await expect(page.getByTestId('profile-name')).toHaveText('Bob Baker')
    expect(rpc('connection_profile')[0]?.args).toEqual({ friend: BOB })
    // The same trophy cards and details window as the Dashboard's; only earned ones show, with no progress.
    const t = msg.celebrations.trophies
    const trophies = page.getByTestId('profile-trophies')
    await expect(trophies.getByTestId('trophy-name')).toHaveText([t.names.habit_streak!])
    const card = trophies.getByTestId('trophy-habit_streak')
    await expect(card.getByTestId('trophy-level')).toHaveText(t.tiers.silver!)
    await expect(card.getByTestId('trophy-progress')).toHaveCount(0)
    await card.getByRole('button').click()
    const details = page.getByRole('dialog', { name: t.names.habit_streak })
    // Someone else's trophy says how it's earned, not "You kept…".
    await expect(details.getByTestId('trophy-details-about')).toHaveText(t.about.habit_streak!)
    await expect(details.getByTestId('trophy-details-levels').getByRole('listitem')).toHaveCount(6)
  })

  test('View my profile on the Account page shows mine as connections see it, from this device, without Invite', async ({ page }) => {
    server.seed('badges', [{ id: 'b-1', kind: 'habit_streak', earned_at: '2026-11-01T00:00:00Z', levels: ['2026-10-01T00:00:00Z'] }])
    await open(page, '/account')
    await page.getByTestId('profile-settings').getByRole('link', { name: m.viewMine }).click()
    await expect(page.getByTestId('profile-name')).toHaveText('Test Person')
    await expect(page.getByTestId('profile-trophies').getByTestId('trophy-habit_streak')).toBeVisible()
    await expect(page.getByRole('button', { name: m.invite })).toHaveCount(0)
    expect(rpc('connection_profile')).toEqual([])
  })

  test('someone I’m not connected with shows nothing but a way back', async ({ page }) => {
    server.rpcResults.connection_profile = []
    await open(page, `/people/${BOB}`)
    await expect(page.getByTestId('profile-unavailable')).toBeVisible()
    await expect(page.getByRole('button', { name: m.invite })).toHaveCount(0)
  })

  test('Invite to event lists my upcoming events, marks ones they’re in, and sends the invite in the app', async ({ page }) => {
    server.seed('events', [event(PARTY, 'Birthday party', '2026-11-20'), event(PICNIC, 'Picnic', '2026-11-21'), event('e-past', 'Old dinner', '2026-11-01')])
    server.rpcResults.connection_profile = bob({ invited_events: [PICNIC] })
    server.rpcResults.invite_people = [{ invite_id: 'inv-bob', name: 'Bob Baker', email: null, phone: null, token: null }]
    await open(page, `/people/${BOB}`)
    await page.getByRole('button', { name: m.invite }).click()
    const dialog = page.getByRole('dialog', { name: m.inviteHeading('Bob Baker') })
    const choice = dialog.getByTestId('invite-event-choice')
    await expect(choice.locator('option')).toHaveCount(2)
    await expect(choice.locator('option', { hasText: 'Picnic' })).toBeDisabled()
    await expect(choice).toHaveValue(PARTY)
    await dialog.getByRole('button', { name: m.send }).click()
    await expect(dialog.getByTestId('invite-status')).toHaveText(m.sent('Bob Baker', 'Birthday party'))
    expect(rpc('invite_people')[0]?.args).toEqual({ event: PARTY, people: [{ user_id: BOB, name: 'Bob Baker' }] })
    // Now it's one they're in, so it can't be sent twice.
    await expect(choice.locator('option', { hasText: 'Birthday party' })).toBeDisabled()
  })

  test('New event opens the Calendar’s new-event editor with them already added', async ({ page }) => {
    server.rpcResults.connection_profile = bob()
    await open(page, `/people/${BOB}`)
    await page.getByRole('button', { name: m.invite }).click()
    await page.getByRole('button', { name: m.newEvent }).click()
    const editor = page.getByRole('dialog', { name: msg.calendar.editor.newHeading })
    await expect(editor).toBeVisible()
    await openAttendees(editor)
    await expect(editor.getByTestId('pending-person')).toContainText('Bob Baker')
  })
})
