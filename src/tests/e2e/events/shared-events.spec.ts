import { expect, test, type Page } from '@playwright/test'
import { openAttendees } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

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
    await expect(page.getByRole('heading', { name: msg.welcome.heading })).toBeVisible()
    await expect(page.getByText(msg.welcome.body)).toBeVisible()
    await page.getByLabel(msg.welcome.phone).fill('call me')
    await page.getByRole('button', { name: msg.welcome.save }).click()
    await expect(page.getByRole('alert')).toContainText('doesn’t look like a phone number')
    await page.getByLabel(msg.welcome.phone).fill('+1 (555) 010-2222')
    await page.getByText(msg.welcome.notifyOptions.both, { exact: true }).click()
    await page.getByRole('button', { name: msg.welcome.save }).click()
    await expect(page).toHaveURL(/\/habits$/)
    expect(server.written('profiles').at(-1)).toMatchObject({ phone: '+1 (555) 010-2222', event_notify_method: 'both' })
  })

  test('event settings: phone, shared free/busy, and my two cancellation messages (finding me by name is gone)', async ({ page }) => {
    await open(page, '/account')
    const card = page.getByTestId('event-settings')
    await expect(card.getByLabel(msg.eventSettings.cancelMessage)).toHaveValue(/I have to cancel \{\{event\}\}/)
    await card.getByRole('checkbox', { name: /Share when I’m free or busy/ }).uncheck()
    await card.getByLabel(msg.eventSettings.dropoutMessage).fill('Sorry {{name}}, can’t make {{event}}.')
    await card.getByRole('button', { name: msg.eventSettings.save }).click()
    await expect(card.getByRole('status')).toHaveText(msg.profile.saved)
    expect(server.written('profiles').at(-1)).toMatchObject({ share_availability: false, cancel_dropout_message: 'Sorry {{name}}, can’t make {{event}}.' })
    // Left as it was (Phase 2 brings the setting back).
    expect(server.written('profiles').at(-1)).toMatchObject({ findable: true })
    await expect(page.getByTestId('availability')).toBeVisible()
  })
})

test.describe('Spec §10 Connections, scheduling: availability for connections', () => {
  test('weekly unavailable times and one-off days are saved', async ({ page }) => {
    await open(page, '/account')
    const card = page.getByTestId('availability')
    await card.getByRole('button', { name: msg.availability.addWeekly }).click()
    await card.getByLabel(msg.calendar.views.day).selectOption({ label: 'Tue' })
    await card.getByLabel(msg.availability.from).fill('09:00')
    await card.getByLabel(msg.availability.until).fill('17:00')
    await card.getByRole('button', { name: msg.invites.addContact, exact: true }).click()
    await expect(card.getByTestId('availability-rule')).toContainText('Tue · 9:00 am – 5:00 pm')
    await expect.poll(() => server.written('availability_rules').at(-1)).toMatchObject({ weekday: 2, start_time: '09:00', end_time: '17:00' })

    await card.getByRole('button', { name: msg.availability.addException }).click()
    await card.getByLabel(msg.calendar.editor.date).fill('2026-11-20')
    await card.getByLabel(msg.availability.note).fill('Dentist')
    await card.getByRole('button', { name: msg.invites.addContact, exact: true }).click()
    await expect(card.getByTestId('availability-exception')).toContainText(msg.calendar.editor.allDay)
    await expect.poll(() => server.written('availability_exceptions').at(-1)).toMatchObject({ date: '2026-11-20', start_time: null, kind: 'unavailable' })
  })

  test('inviting a connection shows whether they are free and suggests times when everyone is', async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.my_connections = [{ friend_id: 'bob-id', display_name: 'Bob Baker', avatar_url: null, since: '2026-11-01T00:00:00Z' }]
    // Bob is unavailable Tuesdays 6 pm to 11 pm.
    server.rpcResults.free_busy = [
      { user_id: 'bob-id', timezone: 'America/New_York', kind: 'rule', weekday: 2, start_date: null, start_time: '18:00:00', end_date: null, end_time: '23:00:00', repeat: null, busy: true },
    ]
    await open(page, '/calendar?date=2026-11-10&event=' + EVENT)
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openAttendees(dialog)
    await dialog.getByRole('button', { name: msg.invites.contacts }).click()
    const contacts = page.getByRole('dialog', { name: msg.contacts.heading })
    await contacts.getByRole('button', { name: 'Add Bob Baker' }).click()
    await contacts.getByRole('button', { name: msg.calendar.view.done }).click()
    await expect(dialog.getByTestId('person-availability')).toHaveText(/busy/)
    const suggestions = dialog.getByTestId('suggested-times').getByRole('button')
    await expect(suggestions).toHaveCount(3)
    await suggestions.first().click()
    await expect(dialog.getByLabel('Starts Time')).not.toHaveValue('19:00')
    await expect(dialog.getByTestId('person-availability')).toHaveText(/free/)
  })
})

test.describe('Spec §5 Shared events and invitations', () => {
  test('inviting by email and phone: the invitations go out, and guests are messaged one at a time with their link', { tag: '@phone' }, async ({ page }) => {
    server.seed('events', [calendarEvent()])
    server.rpcResults.invite_people = [
      { invite_id: 'inv-carol', name: 'Carol', email: 'carol@example.com', phone: null, token: 'tok-carol' },
      { invite_id: 'inv-dan', name: 'Dan', email: null, phone: '(555) 010-3000', token: 'tok-dan' },
    ]
    await open(page, '/calendar?date=2026-11-10&event=' + EVENT)
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openAttendees(dialog)
    await expect(dialog.getByLabel('Find people by name')).toHaveCount(0)
    await dialog.getByLabel(msg.invites.contact).fill('carol@example.com')
    await dialog.getByLabel(msg.invites.contactName).fill('Carol')
    await dialog.getByRole('button', { name: msg.invites.addContact, exact: true }).click()
    await dialog.getByLabel(msg.invites.contact).fill('(555) 010-3000')
    await dialog.getByLabel(msg.invites.contactName).fill('Dan')
    await dialog.getByRole('button', { name: msg.invites.addContact, exact: true }).click()
    await expect(dialog.getByTestId('pending-person')).toHaveCount(2)
    await dialog.getByRole('button', { name: msg.capture.save }).click()

    await expect.poll(() => rpc('invite_people').length).toBe(1)
    expect(rpc('invite_people')[0]!.args).toEqual({
      event: EVENT,
      people: [{ email: 'carol@example.com', name: 'Carol' }, { phone: '(555) 010-3000', name: 'Dan' }],
    })
    const share = page.getByRole('dialog', { name: msg.share.heading })
    await expect(share.getByTestId('share-progress')).toHaveText('1 of 2')
    await expect(share.getByTestId('share-to')).toHaveText('To Carol')
    await expect(share.getByTestId('share-body')).toContainText('Hi Carol! Test Person invited you to Birthday party on Tuesday, November 10 at 7:00 pm.')
    await expect(share.getByTestId('share-open')).toHaveAttribute('href', /^mailto:carol%40example\.com\?subject=Test%20Person%20invited%20you%20to%20Birthday%20party/)
    await share.getByRole('button', { name: msg.share.next }).click()
    await expect(share.getByTestId('share-progress')).toHaveText('2 of 2')
    await expect(share.getByTestId('share-open')).toHaveAttribute('href', /^sms:5550103000[?&]body=.*rsvp%2Finv-dan%2Ftok-dan/)
    await share.getByRole('button', { name: msg.share.next }).click()
    await share.getByRole('button', { name: msg.share.done }).click()
    await expect.poll(() => rpc('mark_shared')[0]?.args).toEqual({ invites: ['inv-carol', 'inv-dan'], msg_kind: 'invite' })
  })

  test('an invitation I received shows on my calendar until I answer, and I answer Yes, Maybe or No', async ({ page }) => {
    server.seed('events', [calendarEvent({ user_id: 'host-id' })])
    server.seed('event_invites', [{ id: 'inv-me', user_id: 'host-id', event_id: EVENT, host_name: 'Alice Able', name: 'Test Person', response: 'pending' }])
    await open(page, '/calendar?date=2026-11-10')
    await page.getByRole('button', { name: msg.calendar.views.day, exact: true }).click()
    const item = page.locator('.cal-wrap .cal-pending').filter({ hasText: 'Birthday party' })
    await expect(item).toBeVisible()
    await item.click()
    const dialog = page.getByTestId('invited-event')
    await expect(dialog).toContainText(msg.invites.from('Alice Able'))
    await expect(dialog).toContainText(msg.invites.pendingLabel)
    await expect(dialog).toContainText(msg.invites.readOnly)
    await dialog.getByRole('button', { name: msg.invites.yes, exact: true }).click()
    await expect.poll(() => rpc('respond_to_invite')[0]?.args).toEqual({ invite: 'inv-me', answer: 'yes' })

    await dialog.getByLabel(msg.invites.messagePlaceholder).fill('Can I bring a friend?')
    await dialog.getByRole('button', { name: msg.invites.send }).click()
    await expect(dialog.getByRole('status')).toHaveText(msg.invites.sent)
    expect(rpc('message_event')[0]!.args).toEqual({ event: EVENT, audience: 'host', message: 'Can I bring a friend?' })
  })

  test('an invitation I said No to is not on my calendar', async ({ page }) => {
    server.seed('events', [calendarEvent({ user_id: 'host-id' })])
    server.seed('event_invites', [{ id: 'inv-me', user_id: 'host-id', event_id: EVENT, host_name: 'Alice', response: 'no' }])
    await open(page, '/calendar?date=2026-11-10')
    await page.getByRole('button', { name: msg.calendar.views.day, exact: true }).click()
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
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    await page.getByRole('dialog', { name: msg.calendar.editor.heading }).getByRole('button', { name: msg.cancelEvent.button }).click()
    const confirm = page.getByRole('alertdialog', { name: msg.cancelEvent.headingCancel })
    await expect(confirm.getByTestId('cancel-who')).toHaveText(/Carol\s*Dan/)
    await expect(confirm.getByTestId('cancel-who')).not.toContainText('Erin')
    await expect(confirm.getByTestId('cancel-preview')).toHaveText('Hi Carol, I\'m sorry, but I have to cancel Birthday party on Tuesday, November 10 at 7:00 pm. Sorry for the short notice!')
    expect(rpc('cancel_event')).toHaveLength(0)
    await confirm.getByRole('button', { name: msg.cancelEvent.button }).click()
    await expect.poll(() => rpc('cancel_event').length).toBe(1)
    const share = page.getByRole('dialog', { name: msg.share.heading })
    await expect(share.getByTestId('share-progress')).toHaveText('1 of 2')
    await share.getByRole('button', { name: msg.share.next }).click()
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
    await page.getByTestId('invited-event').getByRole('button', { name: msg.invites.dropOut }).click()
    const confirm = page.getByRole('alertdialog', { name: msg.cancelEvent.headingDrop })
    await expect(confirm.getByTestId('cancel-who')).toHaveText('Carol')
    await confirm.getByRole('button', { name: msg.cancelEvent.confirmDrop }).click()
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
    await page.getByRole('button', { name: msg.invites.yes, exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Great, see you there!' })).toBeVisible()
    expect(rpc('guest_respond')[0]!.args).toEqual({ invite: 'inv-carol', token: 'tok-carol', answer: 'yes' })

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Add to my calendar/ }).click()
    // WebKit on Linux swaps spaces in a downloaded file's name for underscores; the app names it "Birthday party.ics".
    expect((await download).suggestedFilename()).toMatch(/^Birthday[ _]party\.ics$/)

    await page.getByLabel('Message Alice Able').fill('Running late!')
    await page.getByRole('button', { name: msg.invites.send }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Sent.' })).toBeVisible()
    await page.getByRole('button', { name: msg.guest.stop }).click()
    await expect(page.getByText(msg.guest.stopped)).toBeVisible()
    expect(rpc('guest_opt_out')).toHaveLength(1)
  })

  test('a link that no longer works says so', async ({ page }) => {
    server.rpcResults.guest_invite = []
    await open(page, '/rsvp/inv-x/bad')
    await expect(page.getByTestId('guest-invalid')).toContainText('no longer available')
  })
})

test.describe('Spec §8: before anyone else uses the app', () => {
  test('Download my data saves one JSON file with everything I own', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'Pay rent', due_date: null, priority: 1, status: 'open', source: 'manual' }])
    await open(page, '/account')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: msg.dataExport.button }).click()
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
    await page.getByRole('button', { name: msg.deleteData.button }).click()
    const dialog = page.getByRole('dialog', { name: msg.deleteData.heading })
    await expect(dialog.getByTestId('wipe-removes')).toContainText(msg.deleteData.parts.vault)
    await expect(dialog.getByTestId('wipe-keeps')).toContainText(msg.deleteData.keepList[0]!)
    const confirm = dialog.getByRole('button', { name: msg.deleteData.button })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(msg.deleteData.typeLabel).fill('delete')
    await confirm.click()
    await expect(page.getByRole('status').filter({ hasText: msg.deleteData.done })).toBeVisible()
    expect(rpc('delete_my_data')).toHaveLength(1)
    expect(rpc('delete_my_data')[0]!.args).toEqual({
      parts: ['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its', 'people', 'connections'],
    })
    await expect(page).toHaveURL(/\/account$/)
    await page.goto('/tasks')
    await expect(page.getByRole('button', { name: /^Pay rent/ })).toHaveCount(0)
  })

  test('Delete my data is a checklist: anything unticked, like tags, is kept', async ({ page }) => {
    server.rpcResults.delete_my_data = '2026-11-10T14:05:00.000Z'
    await open(page, '/account')
    await page.getByRole('button', { name: msg.deleteData.button }).click()
    const dialog = page.getByRole('dialog', { name: msg.deleteData.heading })
    await expect(dialog.getByRole('checkbox')).toHaveCount(13)
    await expect(dialog.getByRole('checkbox', { name: msg.postIts.heading })).toBeChecked()
    await dialog.getByRole('button', { name: msg.deleteData.selectNone, exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText(msg.deleteData.noneTicked)
    await dialog.getByLabel(msg.deleteData.typeLabel).fill('DELETE')
    await expect(dialog.getByRole('button', { name: msg.deleteData.button })).toBeDisabled()
    await dialog.getByRole('button', { name: msg.deleteData.selectAll, exact: true }).click()
    await dialog.getByRole('checkbox', { name: msg.pageTitles.tags }).uncheck()
    await dialog.getByRole('checkbox', { name: /^Journal entries/ }).uncheck()
    await expect(dialog.getByTestId('wipe-keeps')).toContainText(msg.pageTitles.tags)
    await expect(dialog.getByTestId('wipe-keeps')).toContainText(msg.deleteData.parts.journal)
    await dialog.getByRole('button', { name: msg.deleteData.button }).click()
    await expect.poll(() => rpc('delete_my_data')[0]?.args).toEqual({
      parts: ['tasks', 'inbox', 'quests', 'vault', 'habits', 'routines', 'priority_tasks', 'events', 'post_its', 'people', 'connections'],
    })
  })

  test('Keep my data deletes nothing', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('button', { name: msg.deleteData.button }).click()
    await page.getByRole('dialog', { name: msg.deleteData.heading }).getByRole('button', { name: msg.deleteData.keep }).click()
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
    await expect(page.getByRole('heading', { name: msg.nav.home, level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pay rent/ })).toHaveCount(0)
  })

  test('privacy policy and terms pages are public and linked', async ({ page }) => {
    await open(page, '/account')
    await page.getByRole('link', { name: msg.legal.privacy }).click()
    await expect(page.getByRole('heading', { name: msg.legal.privacy, level: 1 })).toBeVisible()
    await expect(page.getByText('We don\'t sell your data')).toBeVisible()
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: msg.legal.terms, level: 1 })).toBeVisible()
  })
})
