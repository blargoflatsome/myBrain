import { expect, test, type Page } from '@playwright/test'
import { openAttendees, openSchedule } from '../support/events'
import { FakeSupabase } from '../support/fakeSupabase'
// Wording comes from the messages file, so changing a message never breaks a test.
import { messages as msg } from '../../../messages'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
const guest = {
  host_name: 'Alice Able',
  guest_name: 'Carol',
  title: 'Birthday party',
  notes: null,
  start_date: '2026-11-10',
  start_time: '19:00:00',
  end_date: '2026-11-10',
  end_time: '22:00:00',
  repeat: 'never',
  timezone: 'America/New_York',
  response: 'pending',
  cancelled: false,
  passed: false,
}
let server: FakeSupabase

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
const rpc = (name: string) => server.rpcArgs.filter((c) => c.name === name)

test.describe('Spec §10 Connections part 4: the guest page', () => {
  test.beforeEach(async ({ page }) => {
    server = new FakeSupabase()
    await server.install(page)
  })

  test('30 days after the event the page says it has passed, and nothing can be changed', async ({ page }) => {
    server.rpcResults.guest_invite = [{ ...guest, passed: true }]
    await open(page, '/rsvp/inv-carol/tok-carol')
    await expect(page.getByTestId('guest-passed')).toHaveText(msg.guest.passed)
    await expect(page.getByRole('button', { name: msg.invites.yes })).toHaveCount(0)
    await expect(page.getByRole('button', { name: msg.invites.send })).toHaveCount(0)
  })

  test('a signed-in account holder whose email was invited gets the invitation moved into their calendar', async ({ page }) => {
    server.rpcResults.guest_invite = [guest]
    server.rpcResults.guest_claim_status = 'match'
    server.rpcResults.claim_guest_invite = true
    await open(page, '/rsvp/inv-carol/tok-carol')
    await expect(page.getByTestId('guest-claimed')).toContainText(msg.guest.claimed)
    await expect(page.getByRole('link', { name: msg.guest.openCalendar })).toHaveAttribute('href', '/calendar?date=2026-11-10')
    expect(rpc('claim_guest_invite')[0]?.args).toMatchObject({ invite: 'inv-carol', token: 'tok-carol' })
  })

  test('signed in with a different email, they’re asked before it moves in, or can stay a guest', async ({ page }) => {
    server.rpcResults.guest_invite = [guest]
    server.rpcResults.guest_claim_status = 'ask'
    server.rpcResults.claim_guest_invite = true
    await open(page, '/rsvp/inv-carol/tok-carol')
    const ask = page.getByTestId('guest-accept-as')
    await expect(ask).toContainText('Accept this invitation as')
    await ask.getByRole('button', { name: msg.guest.stayGuest }).click()
    await expect(ask).toHaveCount(0)
    await expect(page.getByRole('button', { name: msg.invites.yes })).toBeVisible()
    expect(rpc('claim_guest_invite')).toHaveLength(0)
    await page.reload()
    await page.getByTestId('guest-accept-as').getByRole('button', { name: msg.guest.acceptAsButton }).click()
    await expect(page.getByTestId('guest-claimed')).toBeVisible()
  })

  test('the host can send a guest a new link; the old one stops working', async ({ page }) => {
    server.seed('events', [{ id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }])
    server.rpcResults.event_people = [{ invite_id: 'inv-carol', name: 'Carol', email: 'carol@example.com', phone: null, response: 'pending', is_me: false }]
    server.rpcResults.new_invite_link = 'newtoken123'
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openSchedule(dialog)
    await openAttendees(dialog)
    await dialog.getByRole('button', { name: 'Send Carol a new link' }).click()
    const fresh = dialog.getByTestId('new-guest-link')
    await expect(fresh).toContainText(msg.connections.newLinkReady('Carol'))
    await expect(fresh).toContainText('/rsvp/inv-carol/newtoken123')
    await expect(fresh.getByRole('link', { name: msg.connections.sendNewLink })).toHaveAttribute('href', /^mailto:carol%40example\.com/)
  })

  test('changing the date or time of an event with invitations offers to let everyone know', async ({ page }) => {
    server.seed('events', [{ id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }])
    server.seed('event_invites', [{ id: 'inv-pat', event_id: EVENT, host_name: 'Test Person', name: 'Pat', email: null, phone: '5550109000', response: 'pending' }])
    server.rpcResults.event_changed = [{ invite_id: 'inv-pat', name: 'Pat', email: null, phone: '5550109000', body: 'Hi Pat, Test Person changed Birthday party: it’s now on Wednesday, November 11 at 7:00 pm.' }]
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openSchedule(dialog)
    await openAttendees(dialog)
    await dialog.getByLabel('Starts Date').fill('2026-11-11')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    const confirm = page.getByRole('alertdialog', { name: msg.connections.letEveryoneKnow.heading })
    await confirm.getByRole('button', { name: msg.connections.letEveryoneKnow.confirm }).click()
    await expect.poll(() => rpc('event_changed')[0]?.args).toMatchObject({ event: EVENT })
    const share = page.getByRole('dialog', { name: msg.share.heading })
    await expect(share.getByTestId('share-body')).toContainText('it’s now on Wednesday, November 11')
  })

  test('changing only the notes doesn’t ask', async ({ page }) => {
    server.seed('events', [{ id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }])
    server.seed('event_invites', [{ id: 'inv-pat', event_id: EVENT, host_name: 'Test Person', name: 'Pat', email: null, phone: '5550109000', response: 'pending' }])
    await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
    await page.getByTestId('calendar-item').getByRole('button', { name: msg.calendar.view.edit }).click()
    const dialog = page.getByRole('dialog', { name: msg.calendar.editor.heading })
    await openSchedule(dialog)
    await openAttendees(dialog)
    await dialog.getByRole('textbox', { name: msg.capture.notesLabel }).fill('Bring snacks')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('alertdialog', { name: msg.connections.letEveryoneKnow.heading })).toBeHidden()
    expect(rpc('event_changed')).toHaveLength(0)
  })
})

test.describe('Spec §10 Connections part 4: the guest page, signed out', () => {
  test('only after answering is a guest offered an optional account, and they come back to the invitation after signing in', async ({ page }) => {
    await page.route(/\/rest\/v1\/rpc\/guest_invite$/, (route) => route.fulfill({ json: [guest] }))
    await page.route(/\/rest\/v1\/rpc\/guest_respond$/, (route) => route.fulfill({ status: 204, body: '' }))
    await open(page, '/rsvp/inv-carol/tok-carol')
    const prompt = page.getByTestId('guest-sign-up')
    await expect(page.getByRole('button', { name: msg.guest.yes })).toBeVisible()
    await expect(prompt).toHaveCount(0)
    await page.getByRole('button', { name: msg.guest.yes }).click()
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: msg.guest.signUpButton }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    expect(await page.evaluate(() => sessionStorage.getItem('my-brain:after-sign-in'))).toBe('/rsvp/inv-carol/tok-carol')
  })
})
