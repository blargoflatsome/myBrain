import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Habits: form layout', () => {
  test('Private sits right under the title; Reminders folds away; no More details', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
    const fields = dialog.getByTestId('habit-fields')
    await expect(fields.locator(':scope > *').first().getByRole('checkbox', { name: /^Private/ })).toBeVisible()
    const howOften = dialog.getByTestId('habit-how-often')
    await expect(howOften.getByRole('radiogroup', { name: msg.forms.howOften })).toBeVisible()
    await expect(howOften.getByRole('group', { name: msg.habits.editor.weekdays })).toBeVisible()
    await expect(dialog.getByText(msg.forms.moreOptions)).toHaveCount(0)
    await expect(dialog.getByRole('combobox', { name: msg.tags.add })).toBeVisible()
    const reminders = dialog.getByTestId('habit-reminders')
    await expect(reminders.getByLabel(msg.habits.editor.notifyTime)).toBeHidden()
    await reminders.locator('summary').click()
    await expect(reminders.getByLabel(msg.habits.editor.notifyTime)).toBeVisible()
    await expect(reminders.getByLabel(msg.habits.editor.timer)).toBeVisible()
    await expect(reminders.getByLabel(/^Priority/)).toBeVisible()
  })

  test('Reminders opens by itself when the habit has a reminder time', async ({ page }) => {
    server.seed('habits', [{ id: 'h1', title: 'Stretch', notify_time: '08:00', timer_minutes: null, weekdays: [4], start_date: '2026-11-01', is_private: false, current_streak: 0, best_streak: 0 }])
    await open(page, '/habits')
    await page.getByRole('button', { name: /Stretch/ }).first().click()
    await expect(page.getByRole('dialog', { name: msg.habits.editor.heading }).getByLabel(msg.habits.editor.notifyTime)).toBeVisible()
  })
})

