import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from '../support/fakeSupabase'
import { isPhone } from '../support/devices'
import { messages as msg } from '../../../messages'

test.use({ timezoneId: 'America/New_York', locale: 'en-US' })

const NOW = new Date('2026-11-10T14:20:00Z')

const DAY = '2026-11-10'

let server: FakeSupabase

// Long things people type (CLAUDE.md): a long sentence and an unbroken pasted link.

async function open(page: Page, path: string) {
  await page.clock.install({ time: NOW })
  await page.goto(path)
}

const lastWrite = (table: string) => server.written(table).at(-1)

test.beforeEach(async ({ page }) => {
  server = new FakeSupabase()
  await server.install(page)
})

test.describe('Spec §5 Date fields: type or pick (on a computer)', () => {
  test.beforeEach(({}, info) => test.skip(isPhone(info), 'phones use their own date picker'))

  test('typing "tomorrow" sets the day, and it shows the app’s way', async ({ page }) => {
    server.seed('tasks', [{ id: 't1', title: 'pay rent', notes: null, due_date: DAY, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' }])
    await open(page, '/tasks')
    await page.getByText('pay rent').click()
    const dialog = page.getByRole('dialog', { name: msg.tasks.editor.heading })
    const date = dialog.getByRole('combobox', { name: msg.capture.taskDateLabel })
    await expect(date).toHaveValue('Tue, Nov 10')
    await date.fill('tomorrow')
    await date.blur()
    await expect(date).toHaveValue('Wed, Nov 11')
    await dialog.getByRole('button', { name: msg.capture.save }).click()
    await expect.poll(() => lastWrite('tasks')?.due_date).toBe('2026-11-11')
  })

  test('the month grid works with the keyboard: arrows, Page Down, Enter; Escape closes just the grid', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const dialog = page.getByRole('dialog', { name: msg.habits.editor.newHeading })
    const start = dialog.getByRole('combobox', { name: msg.habits.editor.startDate })
    await start.focus()
    await page.keyboard.press('ArrowDown')
    await expect(dialog.getByTestId('date-grid')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog.getByTestId('date-grid')).toBeHidden()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('Enter')
    await expect(start).toHaveValue('Fri, Dec 11')
  })

  test('a day before the habit may start can’t be typed in', async ({ page }) => {
    await open(page, '/habits')
    await page.getByRole('button', { name: msg.habits.add }).click()
    const start = page.getByRole('dialog', { name: msg.habits.editor.newHeading }).getByRole('combobox', { name: msg.habits.editor.startDate })
    await start.fill('2026-11-09')
    await start.blur()
    await expect(start).toHaveValue('Tue, Nov 10')
  })
})

