import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './support/fakeSupabase'

// Spec §3: time-dependent behaviour runs on a controlled clock. New York, Tue Nov 10 2026, 9:00 am.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' })
const NOW = new Date('2026-11-10T14:00:00Z')
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001'
const calendarEvent = { id: EVENT, title: 'Birthday party', notes: null, start_date: '2026-11-10', start_time: '19:00:00', end_date: '2026-11-10', end_time: '22:00:00', repeat: 'never', reminder_minutes: null }
// Long typed text (user rule), as a phone contact might hold it.
const LONG_LINE = 'Remember to call the insurance company about the claim from the car accident last spring before Friday'
const LONG_EMAIL = 'areallylongemailaddressthatsomeonetypedwithoutanybreaksatall@example.com'
let server: FakeSupabase

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

type Picked = { name?: string[]; email?: string[]; tel?: string[] }[]

/**
 * Stand in for Android's contact picker the way a real phone behaves: it covers the app (the page is hidden, then
 * shown again) and closing it sends "back" to the open window, during and just after the pick. Like the browser,
 * a "back" that isn't refused closes the window.
 */
async function phonePicker(page: Page, picked: Picked) {
  await page.addInitScript((result) => {
    const back = () => {
      const dialog = document.querySelector('dialog[open]') as HTMLDialogElement | null
      if (!dialog) return
      const cancel = new Event('cancel', { cancelable: true })
      if (dialog.dispatchEvent(cancel)) dialog.close()
    }
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    ;(window as unknown as { ContactsManager: unknown }).ContactsManager = function ContactsManager() {}
    Object.defineProperty(navigator, 'contacts', {
      value: {
        select: async () => {
          setHidden(true)
          setHidden(false)
          back()
          setTimeout(back, 200)
          return result
        },
      },
    })
  }, picked)
}

/** A picker that never sends anything back: the page is hidden while the contacts app is open, then shown again. */
async function silentPicker(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { ContactsManager: unknown }).ContactsManager = function ContactsManager() {}
    Object.defineProperty(navigator, 'contacts', {
      value: {
        select: () => {
          for (const state of ['hidden', 'visible']) {
            Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
            document.dispatchEvent(new Event('visibilitychange'))
          }
          return new Promise(() => {})
        },
      },
    })
  })
}

async function openEvent(page: Page) {
  server.seed('events', [calendarEvent])
  await page.clock.install({ time: NOW })
  await page.goto(`/calendar?date=2026-11-10&event=${EVENT}`)
  const dialog = page.getByRole('dialog', { name: 'Edit event' })
  await expect(dialog.getByRole('button', { name: 'Pick from contacts' })).toBeVisible()
  return dialog
}

test.describe('Spec §5 Calendar: picking from contacts fills the form or adds the people, and says so', () => {
  test('one picked contact fills the email-or-phone and name boxes, ready to Add; the window stays open', async ({ page }) => {
    await phonePicker(page, [{ name: ['Erin Example'], email: ['erin@example.com'], tel: ['555 010 4000'] }])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await page.clock.runFor(300)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Email or phone number')).toHaveValue('erin@example.com')
    await expect(dialog.getByLabel('Their name (optional)')).toHaveValue('Erin Example')
    const status = dialog.getByTestId('people-status')
    await expect(status).toHaveText('Erin Example’s details are filled in. Press Add to invite them.')
    await expect(status).toBeInViewport()
    const add = dialog.getByRole('button', { name: 'Add', exact: true })
    await expect(add).toBeFocused()
    await add.click()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Erin Example/])
    await expect(status).toHaveText('Added Erin Example. They’ll be invited when you save.')
  })

  test('a contact with only a phone number fills the box with the number', async ({ page }) => {
    await phonePicker(page, [{ name: ['Dan'], tel: ['555 010 3000'] }])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await expect(dialog.getByLabel('Email or phone number')).toHaveValue('555 010 3000')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Dan/])
  })

  test('several picked contacts are added at once, and it says how many', async ({ page }) => {
    await phonePicker(page, [{ name: ['Erin'], tel: ['555 010 4000'] }, { name: ['Frank'], email: ['frank@example.com'] }])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await page.clock.runFor(300)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('pending-person')).toHaveText([/^Erin/, /^Frank/])
    await expect(dialog.getByTestId('people-status')).toHaveText('Added 2 people. They’ll be invited when you save.')
    await expect(dialog.getByTestId('people-status')).toBeInViewport()
  })

  test('closing the picker without choosing says nothing was picked', async ({ page }) => {
    await phonePicker(page, [])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await page.clock.runFor(300)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('people-status')).toHaveText('No contact was picked. Try again, or type an email or phone number.')
  })

  test('once the picker has closed, Escape still closes the window', async ({ page }) => {
    await phonePicker(page, [])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await page.clock.runFor(1500)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a long name and a long email fit at 320 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await phonePicker(page, [{ name: [LONG_LINE], email: [LONG_EMAIL] }])
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await expect(dialog.getByTestId('people-status')).toContainText('Press Add to invite them.')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByTestId('pending-person')).toHaveCount(1)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('if the phone closes the app while picking, the reopened event says the contact didn’t come back', async ({ page }) => {
    await silentPicker(page)
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    // Android closed the app in the background; it reloads when I come back.
    await page.reload()
    const error = page.getByRole('dialog', { name: 'Edit event' }).getByTestId('people-error')
    await expect(error).toHaveText('Your phone closed My Brain while you were picking a contact, so it didn’t come back. Try again, or type their email or phone number.')
    await expect(error).toBeInViewport()
    // Said once only.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()
    await expect(page.getByTestId('people-error')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Edit event' })).toHaveCount(0)
  })

  test('for a new event that wasn’t saved, the calendar says the contact didn’t come back', async ({ page }) => {
    await silentPicker(page)
    await page.clock.install({ time: NOW })
    await page.goto('/calendar?date=2026-11-10')
    await page.getByRole('button', { name: 'New event' }).click()
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await page.reload()
    await expect(page.getByTestId('invite-notice')).toHaveText('Your phone closed My Brain while you were picking a contact, so it didn’t come back. Try again, or type their email or phone number.')
  })

  test('if I’m back and the phone still hasn’t sent the contact, it says so after a few seconds', async ({ page }) => {
    await silentPicker(page)
    const dialog = await openEvent(page)
    await dialog.getByRole('button', { name: 'Pick from contacts' }).click()
    await page.clock.runFor(3000)
    await expect(dialog.getByTestId('people-error')).toHaveCount(0)
    await page.clock.runFor(1500)
    await expect(dialog.getByTestId('people-error')).toHaveText('Your phone hasn’t sent the contact back. Try again, or type their email or phone number.')
  })
})
