import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
const calendarEvent = { id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null, cancelled_at: null }
const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'
const LONG_EMAIL = 'areallylongemailaddressthatsomeonetypedwithoutanybreaksatall@example.com'
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}
async function openEvent(page: Page) {
  server.seed('events', [calendarEvent])
  await open(page, `/calendar?date=2026-11-10&event=${EVENT}`)
  const dialog = page.getByRole('dialog', { name: 'Edit event' })
  await expect(dialog).toBeVisible()
  return dialog
}
const person = (id: string, name: string | null, email: string | null, phone: string | null) => ({ id, name, email, phone })

test.describe('Spec §5 Calendar, my people: type someone once, then pick them from a list', () => {
  test('saving the event saves everyone I typed to my people; someone removed before saving isn’t saved', async ({ page }) => {
    server.rpcResults.invite_people = [{ invite_id: 'inv-dan', name: 'Dan', email: null, phone: '555 010 3000', token: 'tok-dan' }]
    const dialog = await openEvent(page)
    await dialog.getByLabel('Email or phone number').fill('555 010 3000')
    await dialog.getByLabel('Their name (optional)').fill('Dan')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByLabel('Email or phone number').fill('typo@example.com')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByRole('button', { name: 'Remove typo@example.com' }).click()
    // Nothing is saved to my people until the event is saved.
    expect(server.written('people')).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('people')).toEqual([expect.objectContaining({ name: 'Dan', email: null, phone: '555 010 3000', deleted_at: null })])
  })

  test('typing someone already saved with a new name updates their name instead of saving them twice', async ({ page }) => {
    server.seed('people', [person('pe-dan', 'Danny', null, '(555) 010-3000')])
    server.rpcResults.invite_people = [{ invite_id: 'inv-dan', name: 'Dan', email: null, phone: '5550103000', token: 'tok-dan' }]
    const dialog = await openEvent(page)
    await dialog.getByLabel('Email or phone number').fill('5550103000')
    await dialog.getByLabel('Their name (optional)').fill('Dan Smith')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => server.written('people')).toEqual([expect.objectContaining({ id: 'pe-dan', name: 'Dan Smith', phone: '(555) 010-3000' })])
  })

  test('Contacts opens my people A to Z; Add keeps the window open with Undo; people already invited show as Invited', async ({ page }) => {
    server.seed('people', [
      person('pe-1', 'Frank', 'frank@example.com', null),
      person('pe-2', 'allie Hannah', null, '(509) 434-8303'),
      person('pe-3', null, 'bob@example.com', null),
      person('pe-4', 'Carol', 'carol@example.com', null),
    ])
    server.rpcResults.event_people = [{ invite_id: 'inv-carol', name: 'Carol', email: 'carol@example.com', phone: null, response: 'yes', is_me: false }]
    const dialog = await openEvent(page)
    await expect(dialog.getByTestId('my-person')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Contacts' }).click()
    const contacts = page.getByRole('dialog', { name: 'Your people' })
    await expect(contacts.getByTestId('contact')).toHaveText([/^allie Hannah · \(509\) 434-8303/, /^bob@example\.com/, /^Carol · carol@example\.com\s*Invited/, /^Frank · frank@example\.com/])
    await contacts.getByRole('button', { name: 'Add allie Hannah' }).click()
    await contacts.getByRole('button', { name: 'Add Frank' }).click()
    await expect(contacts.getByTestId('contact').filter({ hasText: 'Frank' })).toContainText('Added')
    await contacts.getByRole('button', { name: 'Undo adding Frank' }).click()
    await expect(contacts.getByRole('button', { name: 'Add Frank' })).toBeVisible()
    await contacts.getByRole('button', { name: 'Done' }).click()
    await expect(contacts).toBeHidden()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^allie Hannah/])
    // Focus goes back to the Contacts button when the window closes.
    await expect(dialog.getByRole('button', { name: 'Contacts' })).toBeFocused()
  })

  test('the Contacts search filters by name, email or phone digits as I type', async ({ page }) => {
    server.seed('people', [person('pe-1', 'Frank', 'frank@example.com', null), person('pe-2', 'Allie Hannah', null, '(509) 434-8303')])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Contacts' }).click()
    const contacts = page.getByRole('dialog', { name: 'Your people' })
    const search = contacts.getByLabel('Search your people')
    await search.fill('HANN')
    await expect(contacts.getByTestId('contact')).toHaveText([/^Allie Hannah/])
    await search.fill('434-83')
    await expect(contacts.getByTestId('contact')).toHaveText([/^Allie Hannah/])
    await search.fill('zed')
    await expect(contacts.getByTestId('contact')).toHaveCount(0)
    await expect(contacts).toContainText('No one matches.')
  })

  test('typing in the form only adds; it doesn’t search my people', async ({ page }) => {
    server.seed('people', [person('pe-1', 'Frank', 'frank@example.com', null)])
    const dialog = await openEvent(page)
    await dialog.getByLabel('Email or phone number').fill('fra')
    await expect(dialog.getByText('Frank')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByTestId('people-error')).toHaveText('Add an email address or a phone number.')
  })

  test('a long list comes 10 to a page', async ({ page }) => {
    server.seed('people', Array.from({ length: 12 }, (_, i) => person(`pe-${i}`, `Person ${String(i).padStart(2, '0')}`, null, `555010${1000 + i}`)))
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Contacts' }).click()
    const contacts = page.getByRole('dialog', { name: 'Your people' })
    await expect(contacts.getByTestId('contact')).toHaveCount(10)
    await contacts.getByRole('navigation', { name: 'Your people' }).getByRole('button', { name: /Next/ }).click()
    await expect(contacts.getByTestId('contact')).toHaveText([/^Person 10/, /^Person 11/])
  })

  test('with nobody saved yet, Contacts says how to add people; there is no name search', async ({ page }) => {
    const dialog = await openEvent(page)
    await expect(dialog.getByLabel('Find people by name')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Pick from contacts' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Contacts' }).click()
    await expect(page.getByRole('dialog', { name: 'Your people' })).toContainText('No one saved yet.')
  })
})

test.describe('Spec §5 Calendar, my people: fixed or removed on the Account page', () => {
  test('the People section lists my people A to Z; I can edit a name, email or phone', async ({ page }) => {
    server.seed('people', [person('pe-1', 'Frank', 'frank@example.com', null), person('pe-2', 'Allie', null, '5094348303')])
    await open(page, '/account')
    const section = page.getByTestId('my-people-settings')
    await expect(section.getByTestId('saved-person')).toHaveText([/^Allie · 5094348303/, /^Frank · frank@example\.com/])
    await section.getByRole('button', { name: 'Edit Allie' }).click()
    const editor = page.getByRole('dialog', { name: 'Edit person' })
    await editor.getByLabel('Name (optional)').fill('Allie Hannah')
    await editor.getByLabel('Email').fill('not an email')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor.getByTestId('person-error')).toHaveText('That email address doesn’t look right.')
    await editor.getByLabel('Email').fill('Allie@Example.com')
    await editor.getByLabel('Phone number').fill('')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toBeHidden()
    await expect.poll(() => server.written('people').at(-1)).toMatchObject({ id: 'pe-2', name: 'Allie Hannah', email: 'allie@example.com', phone: null })
  })

  test('I can add a person there, and they’re then listed to invite from an event', async ({ page }) => {
    server.seed('events', [calendarEvent])
    await open(page, '/account')
    const section = page.getByTestId('my-people-settings')
    await expect(section).toContainText('No one yet.')
    await section.getByRole('button', { name: 'Add a person' }).click()
    const editor = page.getByRole('dialog', { name: 'Add a person' })
    await editor.getByLabel('Name (optional)').fill('Grace')
    await editor.getByLabel('Phone number').fill('12')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor.getByTestId('person-error')).toHaveText('That phone number doesn’t look right.')
    await editor.getByLabel('Phone number').fill('(555) 010-5000')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toBeHidden()
    await expect(section.getByTestId('people-notice')).toHaveText('Added Grace to your people.')
    await expect(section.getByTestId('saved-person')).toHaveText([/^Grace · \(555\) 010-5000/])
    await expect.poll(() => server.written('people').at(-1)).toMatchObject({ name: 'Grace', email: null, phone: '(555) 010-5000', deleted_at: null })
    await page.goto(`/calendar?date=2026-11-10&event=${EVENT}`)
    await page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Contacts' }).click()
    await expect(page.getByRole('dialog', { name: 'Your people' }).getByTestId('contact')).toHaveText([/^Grace/])
  })

  test('adding someone already saved with that email or phone says so instead of saving them twice', async ({ page }) => {
    server.seed('people', [person('pe-1', 'Frank', 'frank@example.com', null)])
    await open(page, '/account')
    await expect(page.getByTestId('saved-person')).toHaveText([/^Frank/])
    await page.getByRole('button', { name: 'Add a person' }).click()
    const editor = page.getByRole('dialog', { name: 'Add a person' })
    await editor.getByLabel('Email').fill('FRANK@example.com')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor.getByTestId('person-error')).toHaveText('Frank is already in your people with that email or phone number.')
    expect(server.written('people')).toHaveLength(0)
  })

  test('a saved person needs an email or a phone number', async ({ page }) => {
    server.seed('people', [person('pe-1', 'Frank', 'frank@example.com', null)])
    await open(page, '/account')
    await page.getByRole('button', { name: 'Edit Frank' }).click()
    const editor = page.getByRole('dialog', { name: 'Edit person' })
    await editor.getByLabel('Email').fill('')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor.getByTestId('person-error')).toHaveText('Keep an email address or a phone number, so you can invite them.')
  })

  test('removing someone asks first, then takes them off the list', async ({ page }) => {
    server.seed('people', [person('pe-1', 'Frank', 'frank@example.com', null)])
    await open(page, '/account')
    const section = page.getByTestId('my-people-settings')
    await section.getByRole('button', { name: 'Remove Frank' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Remove from your people?' })
    await expect(confirm).toContainText('Frank won’t be listed for invitations any more.')
    await confirm.getByRole('button', { name: 'Remove' }).click()
    await expect(section.getByTestId('saved-person')).toHaveCount(0)
    await expect(section).toContainText('No one yet.')
    await expect.poll(() => server.written('people').at(-1)?.deleted_at).toBeTruthy()
  })

  test('long names and emails fit at 320 px wide, in the event and on the Account page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    server.seed('people', [person('pe-long', LONG_LINE, LONG_EMAIL, null)])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Contacts' }).click()
    const contacts = page.getByRole('dialog', { name: 'Your people' })
    await expect(contacts.getByTestId('contact')).toHaveCount(1)
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await contacts.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    await contacts.getByRole('button', { name: /^Add / }).click()
    await contacts.getByRole('button', { name: 'Done' }).click()
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    await page.goto('/account')
    await expect(page.getByTestId('saved-person')).toHaveCount(1)
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})
