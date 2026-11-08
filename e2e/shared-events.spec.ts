import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const calendarEvent = (extra: Record<string, unknown> = {}) => ({
  id: EVENT,
  title: 'Birthday party',
  notes: 'Bring games',
  start_date: '2026-11-10',
  start_time: '19:00:00',
  end_date: '2026-11-10',
  end_time: '22:00:00',
  repeat: 'never',
  reminder_minutes: null,
  ...extra,
})
const rpc = (name: string) => server.rpcArgs.filter((c) => c.name === name)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Accounts and contact info', () => {
  test('after sign-in, a missing phone number is asked for once, with how event news should reach me', async ({ page }) => {
    server.seed('profiles', [{ ...server.profile, phone: null }])
    await open(page, '/habits')
    await expect(page).toHaveURL(/\/welcome/)
    await expect(page.getByRole('heading', { name: 'One more thing' })).toBeVisible()
    await expect(page.getByText('Past you needs a phone number for event invites.')).toBeVisible()
    await page.getByLabel('Phone number').fill('call me')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toContainText('doesn’t look like a phone number')
    await page.getByLabel('Phone number').fill('+1 (555) 010-2222')
    await page.getByText('Both', { exact: true }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/habits$/)
    expect(server.written('profiles').at(-1)).toMatchObject({ phone: '+1 (555) 010-2222', event_notify_method: 'both' })
  })

  test('event settings: phone and my two cancellation messages (finding me by name and free/busy wait for Phase 2)', async ({ page }) => {
    await open(page, '/account')
    const card = page.getByTestId('event-settings')
    await expect(card.getByLabel('When I cancel an event I made')).toHaveValue(/I have to cancel \{\{event\}\}/)
    await expect(card.getByRole('checkbox')).toHaveCount(0)
    await card.getByLabel('When I drop out of an event').fill('Sorry {{name}}, can’t make {{event}}.')
    await card.getByRole('button', { name: 'Save event settings' }).click()
    await expect(card.getByRole('status')).toHaveText('Saved.')
    expect(server.written('profiles').at(-1)).toMatchObject({ cancel_dropout_message: 'Sorry {{name}}, can’t make {{event}}.' })
    // Left as it was (Phase 2 brings the setting back).
    expect(server.written('profiles').at(-1)).toMatchObject({ findable: true })
    await expect(page.getByTestId('availability')).toHaveCount(0)
  })
})

test.describe('Spec §5 Shared events and invitations', () => {
  test('inviting by email and phone: the invitations go out, and guests are messaged one at a time with their link', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.invite_people = [
      { invite_id: 'inv-carol', name: 'Carol', email: 'carol@example.com', phone: null, token: 'tok-carol' },
      { invite_id: 'inv-dan', name: 'Dan', email: null, phone: '(555) 010-3000', token: 'tok-dan' },
    ]
    await open(page, '/calendar?date=2026-11-10&event=' + EVENT)
    const dialog = page.getByRole('dialog', { name: 'Edit event' })
    await expect(dialog.getByLabel('Find people by name')).toHaveCount(0)
    await dialog.getByLabel('Email or phone number').fill('carol@example.com')
    await dialog.getByLabel('Their name (optional)').fill('Carol')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByLabel('Email or phone number').fill('(555) 010-3000')
    await dialog.getByLabel('Their name (optional)').fill('Dan')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByTestId('pending-person')).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => rpc('invite_people').length).toBe(1)
    expect(rpc('invite_people')[0]!.args).toEqual({
      event: EVENT,
      people: [{ email: 'carol@example.com', name: 'Carol' }, { phone: '(555) 010-3000', name: 'Dan' }],
    })
    const share = page.getByRole('dialog', { name: 'Let people know' })
    await expect(share.getByTestId('share-progress')).toHaveText('1 of 2')
    await expect(share.getByTestId('share-to')).toHaveText('To Carol')
    await expect(share.getByTestId('share-body')).toContainText('Hi Carol! Test Person invited you to Birthday party on Tuesday, November 10 at 7:00 pm.')
    await expect(share.getByTestId('share-open')).toHaveAttribute('href', /^mailto:carol%40example\.com\?subject=Test%20Person%20invited%20you%20to%20Birthday%20party/)
    await share.getByRole('button', { name: 'Sent it, next' }).click()
    await expect(share.getByTestId('share-progress')).toHaveText('2 of 2')
    await expect(share.getByTestId('share-open')).toHaveAttribute('href', /^sms:5550103000\?body=.*rsvp%2Finv-dan%2Ftok-dan/)
    await share.getByRole('button', { name: 'Sent it, next' }).click()
    await share.getByRole('button', { name: 'All done' }).click()
    await expect.poll(() => rpc('mark_shared')[0]?.args).toEqual({ invites: ['inv-carol', 'inv-dan'], msg_kind: 'invite' })
  })

  test('an invitation I received shows on my calendar until I answer, and I answer Yes, Maybe or No', async ({ page }) => {
    server.seed('events', [calendarEvent({ user_id: 'host-id' })])
    server.seed('event_invites', [{ id: 'inv-me', user_id: 'host-id', event_id: EVENT, host_name: 'Alice Able', name: 'Test Person', response: 'pending' }])
    await open(page, '/calendar?date=2026-11-10')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    const item = page.locator('.cal-wrap .cal-pending').filter({ hasText: 'Birthday party' })
    await expect(item).toBeVisible()
    await item.click()
    const dialog = page.getByTestId('invited-event')
    await expect(dialog).toContainText('Invited by Alice Able')
    await expect(dialog).toContainText('Past you was invited. Going?')
    await expect(dialog).toContainText('Only the person who made this event can change it.')
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect.poll(() => rpc('respond_to_invite')[0]?.args).toEqual({ invite: 'inv-me', answer: 'yes' })

    await dialog.getByLabel('Write your message').fill('Can I bring a friend?')
    await dialog.getByRole('button', { name: 'Send' }).click()
    await expect(dialog.getByRole('status')).toHaveText('Sent.')
    expect(rpc('message_event')[0]!.args).toEqual({ event: EVENT, audience: 'host', message: 'Can I bring a friend?' })
  })

  test('an invitation I said No to is not on my calendar', async ({ page }) => {
    server.seed('events', [calendarEvent({ user_id: 'host-id' })])
    server.seed('event_invites', [{ id: 'inv-me', user_id: 'host-id', event_id: EVENT, host_name: 'Alice', response: 'no' }])
    await open(page, '/calendar?date=2026-11-10')
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await expect(page.locator('.cal-wrap').getByText('Birthday party')).toHaveCount(0)
  })
})

test.describe('Spec §5 Cancelling an event or attendance', () => {
  test('the creator cancels: the confirmation lists who will be told and my message; guests are messaged one at a time', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.event_people = [
      { invite_id: 'inv-carol', name: 'Carol', email: 'carol@example.com', phone: null, response: 'yes', is_me: false },
      { invite_id: 'inv-dan', name: 'Dan', email: null, phone: '5550103000', response: 'pending', is_me: false },
      { invite_id: 'inv-erin', name: 'Erin', email: 'erin@example.com', phone: null, response: 'no', is_me: false },
    ]
    server.rpcResults.cancel_event = [
      { invite_id: 'inv-carol', name: 'Carol', email: 'carol@example.com', phone: null, body: 'Hi Carol, I’m sorry, but I have to cancel Birthday party on Tuesday, November 10 at 7:00 pm. Sorry for the short notice!' },
      { invite_id: 'inv-dan', name: 'Dan', email: null, phone: '5550103000', body: 'Hi Dan, I’m sorry, but I have to cancel Birthday party on Tuesday, November 10 at 7:00 pm. Sorry for the short notice!' },
    ]
    await open(page, '/calendar?date=2026-11-10&event=' + EVENT)
    await page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Cancel and notify' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Cancel this event?' })
    await expect(confirm.getByTestId('cancel-who')).toHaveText(/Carol\s*Dan/)
    await expect(confirm.getByTestId('cancel-who')).not.toContainText('Erin')
    await expect(confirm.getByTestId('cancel-preview')).toHaveText('Hi Carol, I\'m sorry, but I have to cancel Birthday party on Tuesday, November 10 at 7:00 pm. Sorry for the short notice!')
    expect(rpc('cancel_event')).toHaveLength(0)
    await confirm.getByRole('button', { name: 'Cancel and notify' }).click()
    await expect.poll(() => rpc('cancel_event').length).toBe(1)
    const share = page.getByRole('dialog', { name: 'Let people know' })
    await expect(share.getByTestId('share-progress')).toHaveText('1 of 2')
    await share.getByRole('button', { name: 'Sent it, next' }).click()
    await expect(share.getByTestId('share-body')).toContainText('Hi Dan,')
  })

  test('an attendee drops out: only their attendance, and the host and others going are told', async ({ page }) => {
    server.seed('events', [calendarEvent({ user_id: 'host-id' })])
    server.seed('event_invites', [{ id: 'inv-me', user_id: 'host-id', event_id: EVENT, host_name: 'Alice Able', response: 'yes' }])
    server.rpcResults.event_people = [
      { invite_id: 'inv-me', name: 'Test Person', email: null, phone: null, response: 'yes', is_me: true },
      { invite_id: 'inv-carol', name: 'Carol', email: null, phone: null, response: 'yes', is_me: false },
    ]
    await open(page, '/calendar?date=2026-11-10&event=' + EVENT)
    await page.getByTestId('invited-event').getByRole('button', { name: 'I can’t make it (cancel and notify)' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Drop out of this event?' })
    await expect(confirm.getByTestId('cancel-who')).toHaveText('Carol')
    await confirm.getByRole('button', { name: 'Drop out and notify' }).click()
    await expect.poll(() => rpc('drop_out')[0]?.args).toEqual({ event: EVENT })
  })
})

test.describe('Spec §5 Guests answer without an account', () => {
  const guest = {
    host_name: 'Alice Able',
    guest_name: 'Carol',
    title: 'Birthday party',
    notes: 'Bring games',
    start_date: '2026-11-20',
    start_time: '19:00:00',
    end_date: '2026-11-20',
    end_time: '22:00:00',
    repeat: 'never',
    timezone: 'America/New_York',
    response: 'pending',
    cancelled: false,
  }

  test('the private link shows the event; the guest answers, messages the host, adds it to a calendar, or stops emails', async ({ page }) => {
    server.rpcResults.guest_invite = [guest]
    await open(page, '/rsvp/inv-carol/tok-carol')
    await expect(page.getByText('Alice Able invited you')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Birthday party' })).toBeVisible()
    await expect(page.getByTestId('guest-when')).toHaveText('Friday, November 20 at 7:00 pm')
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Great, see you there!' })).toBeVisible()
    expect(rpc('guest_respond')[0]!.args).toEqual({ invite: 'inv-carol', token: 'tok-carol', answer: 'yes' })

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Add to my calendar/ }).click()
    expect((await download).suggestedFilename()).toBe('Birthday party.ics')

    await page.getByLabel('Message Alice Able').fill('Running late!')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Sent.' })).toBeVisible()
    await page.getByRole('button', { name: 'Stop these emails' }).click()
    await expect(page.getByText('You won’t get more messages')).toBeVisible()
    expect(rpc('guest_opt_out')).toHaveLength(1)
  })

  test('a link that no longer works says so', async ({ page }) => {
    server.rpcResults.guest_invite = []
    await open(page, '/rsvp/inv-x/bad')
    await expect(page.getByTestId('guest-invalid')).toContainText('no longer works')
  })
})

test.describe('Spec §8: before anyone else uses the app', () => {
  test('Download my data saves one JSON file with everything I own', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'Pay rent', due_date: null, priority: 1, status: 'open', source: 'manual' }])
    await open(page, '/account')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download my data' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('my-brain-data-2026-11-10.json')
    const data = JSON.parse(await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8')))
    expect(data.app).toBe('My Brain')
    expect(data.tables.tasks[0]).toMatchObject({ title: 'Pay rent' })
    expect(Object.keys(data.tables)).toEqual(expect.arrayContaining(['tasks', 'habits', 'journal_entries', 'events', 'event_invites', 'outbound_messages']))
  })

  test('Delete my data: the confirmation says what goes and what stays, then everything I added is cleared', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' }])
    server.rpcResults.delete_my_data = () => {
      server.clear('tasks')
      server.setProfile({ data_reset_at: '2026-11-10T14:05:00.000Z' })
      return '2026-11-10T14:05:00.000Z'
    }
    await open(page, '/tasks')
    await expect(page.getByRole('button', { name: /^Pay rent/ })).toBeVisible()
    await page.goto('/account')
    await page.getByRole('button', { name: 'Delete my data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your data and start fresh?' })
    await expect(dialog.getByTestId('wipe-removes')).toContainText('The Vault (it goes back to the 3 starter buckets)')
    await expect(dialog.getByTestId('wipe-keeps')).toContainText('Your account, profile and all settings')
    const confirm = dialog.getByRole('button', { name: 'Delete my data' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Type DELETE to confirm').fill('delete')
    await confirm.click()
    await expect(page.getByRole('status').filter({ hasText: 'Past you left a clean slate.' })).toBeVisible()
    expect(rpc('delete_my_data')).toHaveLength(1)
    expect(rpc('delete_my_data')[0]!.args).toEqual({
      parts: ['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its', 'people'],
    })
    await expect(page).toHaveURL(/\/account$/)
    await page.goto('/tasks')
    await expect(page.getByRole('button', { name: /^Pay rent/ })).toHaveCount(0)
  })

  test('Delete my data is a checklist: anything unticked, like tags, is kept', async ({ page }) => {
    server.rpcResults.delete_my_data = '2026-11-10T14:05:00.000Z'
    await open(page, '/account')
    await page.getByRole('button', { name: 'Delete my data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your data and start fresh?' })
    await expect(dialog.getByRole('checkbox')).toHaveCount(12)
    await expect(dialog.getByRole('checkbox', { name: 'Post Its' })).toBeChecked()
    await dialog.getByRole('button', { name: 'Untick all', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Tick at least one thing to delete.')
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
    await expect(dialog.getByRole('button', { name: 'Delete my data' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Tick all', exact: true }).click()
    await dialog.getByRole('checkbox', { name: 'Tags' }).uncheck()
    await dialog.getByRole('checkbox', { name: /^Journal entries/ }).uncheck()
    await expect(dialog.getByTestId('wipe-keeps')).toContainText('Tags')
    await expect(dialog.getByTestId('wipe-keeps')).toContainText('Journal entries')
    await dialog.getByRole('button', { name: 'Delete my data' }).click()
    await expect.poll(() => rpc('delete_my_data')[0]?.args).toEqual({
      parts: ['tasks', 'inbox', 'quests', 'vault', 'habits', 'routines', 'priority_tasks', 'events', 'post_its', 'people'],
    })
  })

  test('Keep my data deletes nothing', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: 'Delete my data' }).click()
    await page.getByRole('dialog', { name: 'Delete your data and start fresh?' }).getByRole('button', { name: 'Keep my data' }).click()
    expect(rpc('delete_my_data')).toHaveLength(0)
  })

  test('after my data is deleted on another device, this device clears its copy when it opens', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 1, status: 'open', source: 'manual' }])
    await open(page, '/tasks')
    await expect(page.getByRole('button', { name: /^Pay rent/ })).toBeVisible()
    // Another device deleted my data: the server has no tasks now, and a newer reset time.
    server.clear('tasks')
    server.setProfile({ data_reset_at: '2026-11-10T14:30:00.000Z' })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pay rent/ })).toHaveCount(0)
  })

  test('privacy policy and terms pages are public and linked', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('link', { name: 'Privacy policy' }).click()
    await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible()
    await expect(page.getByText('We don\'t sell your data')).toBeVisible()
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms of service', level: 1 })).toBeVisible()
  })
})
