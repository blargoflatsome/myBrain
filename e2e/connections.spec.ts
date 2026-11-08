import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
const BOB = '22222222-2222-4222-8222-222222222222'
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

test.describe('Spec §10 Connections: ask, answer, remove', () => {
  test('asking by email or phone always gives the same answer, so it never reveals whether they have an account', async ({ page }) => {
    await open(page, '/connections')
    await expect(page.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible()
    const box = page.getByLabel('Their email or phone number')
    await box.fill('bob')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByTestId('ask-error')).toHaveText('Type their full email address or phone number.')
    await box.fill('Bob@Example.com')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByTestId('ask-status')).toHaveText('Sent. If they use My Brain, they’ll get your request.')
    await expect.poll(() => rpc('request_connection')[0]?.args).toMatchObject({ contact: 'Bob@Example.com' })
    await expect(box).toHaveValue('')
  })

  test('a request waiting for me can be accepted, declined or blocked', async ({ page }) => {
    server.rpcResults.incoming_connection_requests = [{ id: 'req-1', display_name: 'Bob Baker', avatar_url: null, created_at: '2026-11-09T12:00:00Z' }]
    await open(page, '/connections')
    const request = page.getByTestId('incoming-request')
    await expect(request).toContainText('Bob Baker wants to connect')
    await request.getByRole('button', { name: 'Accept' }).click()
    await expect.poll(() => rpc('answer_connection_request')[0]?.args).toMatchObject({ req: 'req-1', answer: 'accept' })
  })

  test('my connections and sent requests are listed; removing or blocking asks first and isn’t announced', async ({ page }) => {
    server.rpcResults.my_connections = [{ friend_id: BOB, display_name: 'Bob Baker', avatar_url: null, since: '2026-11-01T00:00:00Z' }]
    server.rpcResults.sent_connection_requests = [{ id: 'req-2', contact: 'carol@example.com', created_at: '2026-11-09T12:00:00Z' }]
    await open(page, '/connections')
    await expect(page.getByTestId('connection')).toContainText('Bob Baker')
    await expect(page.getByTestId('sent-request')).toContainText('carol@example.com · Sent')
    await page.getByRole('button', { name: 'Block Bob Baker' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Block this person?' })
    await expect(confirm).toContainText('They aren’t told.')
    await confirm.getByRole('button', { name: 'Block' }).click()
    await expect.poll(() => rpc('remove_connection')[0]?.args).toMatchObject({ friend: BOB, also_block: true })
    await page.getByRole('button', { name: 'Cancel request to carol@example.com' }).click()
    await expect.poll(() => rpc('cancel_connection_request')[0]?.args).toMatchObject({ req: 'req-2' })
  })

  test('the Account page links to Connections', async ({ page }) => {
    await open(page, '/account')
    await page.locator('#content').getByRole('link', { name: 'Connections' }).click()
    await expect(page).toHaveURL(/\/connections$/)
  })
})

test.describe('Spec §10 Connections: inviting a connection in the app', () => {
  test('connections are listed first in Contacts, and adding one invites them in the app by their account', async ({ page }) => {
    server.seed('events', [{ id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }])
    server.rpcResults.my_connections = [{ friend_id: BOB, display_name: 'Bob Baker', avatar_url: null, since: '2026-11-01T00:00:00Z' }]
    server.rpcResults.invite_people = [{ invite_id: 'inv-bob', name: 'Bob Baker', email: null, phone: null, token: null }]
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await dialog.getByRole('button', { name: 'Contacts' }).click()
    const contacts = page.getByRole('dialog', { name: 'Your people' })
    const onMyBrain = contacts.getByTestId('contacts-connections')
    await expect(onMyBrain.getByRole('heading', { name: 'On My Brain' })).toBeVisible()
    await onMyBrain.getByRole('button', { name: 'Add Bob Baker' }).click()
    await expect(onMyBrain).toContainText('Added')
    await contacts.getByRole('button', { name: 'Done' }).click()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Bob Baker/])
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => rpc('invite_people')[0]?.args).toMatchObject({ event: EVENT, people: [{ user_id: BOB, name: 'Bob Baker' }] })
    // App users aren't saved to my people (they're connections).
    expect(server.written('people')).toHaveLength(0)
  })
})

test.describe('Spec §10 Connections: links and codes', () => {
  test('making a link shows the link and an 8-character code, once; working links can be cancelled', async ({ page }) => {
    server.rpcResults.create_connect_link = [{ id: 'link-1', token: 'abc123token', code: 'K7M2Q9XP', expires_at: '2026-11-11T14:00:00Z' }]
    server.rpcResults.my_connect_links = [{ id: 'link-1', created_at: '2026-11-10T14:00:00Z', expires_at: '2026-11-11T14:00:00Z' }]
    await open(page, '/connections')
    await page.getByRole('button', { name: 'Make a link' }).click()
    await expect(page.getByTestId('new-link-url')).toHaveText(/\/connect\/abc123token$/)
    await expect(page.getByTestId('new-link-code')).toHaveText('K7M2Q9XP')
    await expect(page.getByTestId('active-link')).toHaveCount(1)
    await page.getByRole('button', { name: 'Cancel link' }).click()
    await expect.poll(() => rpc('cancel_connect_link')[0]?.args).toMatchObject({ link: 'link-1' })
    await expect(page.getByTestId('new-link')).toHaveCount(0)
  })

  test('entering someone’s code shows whose it is; Connect connects us straight away', async ({ page }) => {
    server.rpcResults.preview_connect_link = [{ display_name: 'Bob Baker', avatar_url: null, already_connected: false }]
    server.rpcResults.use_connect_link = 'Bob Baker'
    await open(page, '/connections')
    await page.getByLabel('Their 8-character code').fill('k7m2q9xp')
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.getByTestId('code-owner')).toContainText('Connect with Bob Baker?')
    await page.getByTestId('code-owner').getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByTestId('ask-status')).toHaveText('You’re connected with Bob Baker.')
    expect(rpc('use_connect_link')[0]?.args).toMatchObject({ token: null, code: 'k7m2q9xp' })
  })

  test('a code that doesn’t work says so', async ({ page }) => {
    server.rpcResults.preview_connect_link = []
    await open(page, '/connections')
    await page.getByLabel('Their 8-character code').fill('ZZZZZZZZ')
    await page.getByRole('button', { name: 'Find' }).click()
    await expect(page.getByTestId('code-error')).toHaveText('That code doesn’t work. It may have expired or been used.')
  })

  test('opening a connect link shows whose it is and connects on Connect; a used link says it no longer works', async ({ page }) => {
    server.rpcResults.preview_connect_link = [{ display_name: 'Bob Baker', avatar_url: null, already_connected: false }]
    server.rpcResults.use_connect_link = 'Bob Baker'
    await open(page, '/connect/abc123token')
    await expect(page.getByTestId('link-owner')).toHaveText('Connect with Bob Baker?')
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByTestId('link-done')).toHaveText('You’re connected with Bob Baker.')
    expect(rpc('use_connect_link')[0]?.args).toMatchObject({ token: 'abc123token' })
    server.rpcResults.preview_connect_link = []
    await page.reload()
    await expect(page.getByTestId('link-problem')).toHaveText('This link no longer works. It may have expired, been used, or been cancelled.')
  })
})

test.describe('Spec §10 Connections: connect from my people and from a guest invitation', () => {
  test('saved people who have accounts show Connect on the Account page; it sends them a request', async ({ page }) => {
    server.seed('people', [{ id: 'pe-carol', name: 'Carol', email: 'carol@example.com', phone: null }, { id: 'pe-dan', name: 'Dan', email: null, phone: '5550103000' }])
    server.rpcResults.people_with_accounts = [{ person_id: 'pe-carol' }]
    await open(page, '/account')
    const section = page.getByTestId('my-people-settings')
    await expect(section.getByRole('button', { name: 'Connect with Carol' })).toBeVisible()
    await expect(section.getByRole('button', { name: 'Connect with Dan' })).toHaveCount(0)
    server.rpcResults.people_with_accounts = []
    await section.getByRole('button', { name: 'Connect with Carol' }).click()
    await expect(section.getByTestId('people-notice')).toHaveText('Request sent to Carol. They’ll need to accept.')
    expect(rpc('request_connection')[0]?.args).toMatchObject({ contact: 'carol@example.com' })
    await expect(section.getByRole('button', { name: 'Connect with Carol' })).toHaveCount(0)
  })

  test('the Contacts window shows Connect on saved people who have accounts', async ({ page }) => {
    server.seed('events', [{ id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }])
    server.seed('people', [{ id: 'pe-carol', name: 'Carol', email: 'carol@example.com', phone: null }])
    server.rpcResults.people_with_accounts = [{ person_id: 'pe-carol' }]
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    await page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Contacts' }).click()
    const contacts = page.getByRole('dialog', { name: 'Your people' })
    await contacts.getByRole('button', { name: 'Connect with Carol' }).click()
    await expect(contacts.getByTestId('contacts-status')).toHaveText('Request sent to Carol. They’ll need to accept.')
  })

  test('a signed-in account holder who answers a guest invitation is offered to connect with the host', async ({ page }) => {
    server.rpcResults.guest_invite = [{ host_name: 'Alice Able', guest_name: 'Carol', title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', timezone: 'America/New_York', response: 'pending', cancelled: false }]
    server.rpcResults.guest_connect_offer = true
    await open(page, '/rsvp/inv-carol/tok-carol')
    await expect(page.getByRole('heading', { name: 'Birthday party' })).toBeVisible()
    // Only after answering Yes or Maybe.
    await expect(page.getByTestId('guest-connect')).toHaveCount(0)
    server.rpcResults.guest_invite = [{ ...(server.rpcResults.guest_invite as Record<string, unknown>[])[0], response: 'yes' }]
    await page.getByRole('button', { name: 'Yes' }).click()
    await expect(page.getByTestId('guest-connect')).toContainText('Connect with Alice Able')
    await page.getByTestId('guest-connect').getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByTestId('guest-connect-sent')).toHaveText('Request sent. Alice Able will need to accept.')
    expect(rpc('guest_connect_with_host')[0]?.args).toMatchObject({ invite: 'inv-carol', token: 'tok-carol' })
  })
})

test.describe('Spec §10 Connections: who’s going', () => {
  const event = { id: EVENT, user_id: 'host-id', title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }

  test('an invitee sees who else is going, can connect with them, and can hide themselves', async ({ page }) => {
    server.seed('events', [event])
    server.seed('event_invites', [{ id: 'inv-me', user_id: 'host-id', event_id: EVENT, host_name: 'Alice Able', name: 'Test Person', response: 'yes', visible: true }])
    server.rpcResults.event_attendees = [
      { user_id: 'host-id', display_name: 'Alice Able', avatar_url: null, is_host: true, connected: true, can_connect: false },
      { user_id: BOB, display_name: 'Bob Baker', avatar_url: null, is_host: false, connected: false, can_connect: true },
      { user_id: null, display_name: 'Dan', avatar_url: null, is_host: false, connected: false, can_connect: false },
    ]
    await open(page, '/calendar?date=2026-11-10')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await page.locator('.cal-wrap').getByText('Birthday party').first().click()
    const dialog = page.getByTestId('invited-event')
    const going = dialog.getByTestId('whos-going')
    await expect(going.getByTestId('attendee')).toHaveText([/^Alice Able · host\s*Connected/, /^Bob Baker\s*Connect/, /^Dan$/])
    await going.getByRole('button', { name: 'Connect with Bob Baker' }).click()
    await expect(going.getByTestId('attendee-status')).toHaveText('Request sent to Bob Baker. They’ll need to accept.')
    expect(rpc('connect_via_event')[0]?.args).toMatchObject({ event: EVENT, friend: BOB })
    await dialog.getByRole('checkbox', { name: /Show me to other guests/ }).uncheck()
    await expect.poll(() => rpc('set_event_visibility')[0]?.args).toMatchObject({ invite: 'inv-me', show: false })
  })

  test('the host chooses whether guests can see who’s going', async ({ page }) => {
    server.seed('events', [{ ...event, user_id: undefined }])
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    const box = dialog.getByRole('checkbox', { name: /Guests can see who’s going/ })
    await expect(box).toBeChecked()
    await box.uncheck()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('events').at(-1)).toMatchObject({ id: EVENT, show_guests: false })
  })
})
